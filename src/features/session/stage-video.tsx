import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioDelayTracker, type PlayoutCounters } from '@/core/media/delay-tracker';
import { DelayedAudio } from '@/core/media/delayed-audio';
import { cn } from '@/lib/utils';
import { FADE_WHEN_IDLE } from './stage-fullscreen';
import { StageNote } from './stage-note';

interface StageVideoProps {
  stream: MediaStream;
  /** Who shares, shown in a corner. */
  label?: string;
  /**
   * No sound at all and no controls for it, e.g. the host's own preview. The element gets a copy of
   * the stream without its audio tracks, so nothing can play, whatever the browser does with a
   * muted element: the host hears the shared tab itself, a second copy would be an echo.
   */
  silent?: boolean;
  /** Where the volume starts, from 0 (silent) to 1 (full). */
  volume?: number;
  /** Called when the viewer moves the volume slider, so the level can be remembered. */
  onVolumeChange?: (volume: number) => void;
  /**
   * Plays the sound this many milliseconds late, to keep it in step with a picture the browser
   * holds back (the smoothing buffer). 0 plays the stream as it is.
   */
  audioDelayMs?: number;
  /**
   * Reads how long picture and sound wait in the browser's buffers. With it the sound delay
   * follows the picture's real buffer, which on a real connection is larger than the target;
   * `audioDelayMs` is what is used until a measurement exists.
   */
  readPlayoutCounters?: () => Promise<PlayoutCounters | null>;
}

/** How often the buffers are measured to keep the sound in step with the picture. */
const MEASURE_INTERVAL_MS = 1_000;

/** The level a viewer gets when they switch the sound on from 0. */
const FALLBACK_VOLUME = 0.5;

/**
 * Plays a shared stream on the stage, with a mute button and a volume slider. If
 * the browser refuses to start it with sound, it plays muted and says so, so the
 * picture is never stuck.
 */
export function StageVideo({
  stream,
  label,
  silent = false,
  volume = 1,
  onVolumeChange,
  audioDelayMs = 0,
  readPlayoutCounters,
}: StageVideoProps) {
  const source = useMemo(
    () => (silent ? new MediaStream(stream.getVideoTracks()) : stream),
    [stream, silent],
  );
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(silent);
  const [level, setLevel] = useState(volume);
  const [blocked, setBlocked] = useState(false);
  const soundOff = muted || level === 0;
  const delayed = useRef<DelayedAudio | null>(null);
  const wanted = !silent && audioDelayMs > 0 && typeof AudioContext !== 'undefined';
  // Once the sound has gone through the delay, it stays there for this stream, at 0 ms if the
  // viewer goes back to Standard: swapping to the element's own sound would be a second,
  // audible jump (the delay it was playing with against the plain path).
  const [engagedFor, setEngagedFor] = useState<MediaStream | null>(null);
  const delaying =
    !silent && typeof AudioContext !== 'undefined' && (wanted || engagedFor === source);
  if (wanted && engagedFor !== source) setEngagedFor(source);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = source;
  }, [source]);

  // The sound goes through a delay of its own; the element then stays muted but attached, which
  // is what makes the browser deliver the stream's sound to the graph.
  useEffect(() => {
    if (!delaying) return;
    let audio: DelayedAudio;
    try {
      audio = new DelayedAudio(source, audioDelayMs, 1);
    } catch {
      return;
    }
    delayed.current = audio;
    void audio.resume().then((playing) => {
      if (!playing && delayed.current === audio) {
        setMuted(true);
        setBlocked(true);
      }
    });
    return () => {
      if (delayed.current === audio) delayed.current = null;
      audio.dispose();
    };
    // The delay itself is applied by the effect below, so a new length does not restart the sound.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, delaying]);

  // Until the browser's counters say how late the picture really is, the asked-for time is used;
  // then the sound follows the measured difference.
  useEffect(() => {
    delayed.current?.setDelay(audioDelayMs);
    if (!delaying || !readPlayoutCounters) return;
    const tracker = new AudioDelayTracker();
    let stopped = false;
    const timer = setInterval(() => {
      void readPlayoutCounters()
        .then((counters) => {
          const measured = stopped ? null : tracker.update(counters);
          if (measured !== null) delayed.current?.setDelay(measured);
        })
        .catch(() => undefined);
    }, MEASURE_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [audioDelayMs, delaying, readPlayoutCounters]);

  useEffect(() => {
    delayed.current?.setLevel(muted ? 0 : level);
  }, [muted, level, delaying]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = level;
    element.muted = muted || delaying;
    void Promise.resolve(element.play?.()).catch(() => {
      if (!muted) {
        setMuted(true);
        setBlocked(true);
      }
    });
  }, [source, muted, level, delaying]);

  const changeLevel = (next: number) => {
    void delayed.current?.resume();
    setLevel(next);
    onVolumeChange?.(next);
  };

  const toggleMute = () => {
    void delayed.current?.resume();
    setBlocked(false);
    if (soundOff && level === 0) changeLevel(FALLBACK_VOLUME);
    setMuted(!soundOff);
  };

  return (
    <>
      <video
        ref={video}
        autoPlay
        playsInline
        className="size-full bg-black object-contain"
        data-testid="stage-video"
      />
      {label && (
        <StageNote
          className={cn('absolute bottom-3 left-3', FADE_WHEN_IDLE)}
          data-testid="stage-label"
        >
          {label}
        </StageNote>
      )}
      {!silent && (
        <div className={cn('absolute right-3 bottom-3 flex items-center gap-2', FADE_WHEN_IDLE)}>
          {blocked && (
            <StageNote data-testid="sound-blocked">
              The browser started the video without sound.
            </StageNote>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon-sm"
            aria-label={soundOff ? 'Turn sound on' : 'Mute'}
            title={soundOff ? 'Turn sound on' : 'Mute'}
            onClick={toggleMute}
            data-testid="sound-button"
          >
            {soundOff ? <VolumeX /> : <Volume2 />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : level}
            onChange={(event) => {
              const next = Number(event.target.value);
              setBlocked(false);
              if (next > 0) setMuted(false);
              changeLevel(next);
            }}
            aria-label="Volume"
            aria-valuetext={`${Math.round((muted ? 0 : level) * 100)} percent`}
            className="h-1.5 w-24 cursor-pointer accent-primary"
            data-testid="volume-slider"
          />
        </div>
      )}
    </>
  );
}
