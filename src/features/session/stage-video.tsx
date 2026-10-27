import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FADE_WHEN_IDLE } from './stage-fullscreen';

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
}

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

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = source;
  }, [source]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.volume = level;
    element.muted = muted;
    void Promise.resolve(element.play?.()).catch(() => {
      if (!muted) {
        setMuted(true);
        setBlocked(true);
      }
    });
  }, [source, muted, level]);

  const changeLevel = (next: number) => {
    setLevel(next);
    onVolumeChange?.(next);
  };

  const toggleMute = () => {
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
        <p
          className={cn(
            'absolute bottom-3 left-3 rounded-md bg-background/70 px-2 py-1 text-sm',
            FADE_WHEN_IDLE,
          )}
          data-testid="stage-label"
        >
          {label}
        </p>
      )}
      {!silent && (
        <div className={cn('absolute right-3 bottom-3 flex items-center gap-2', FADE_WHEN_IDLE)}>
          {blocked && (
            <p
              className="rounded-md bg-background/70 px-2 py-1 text-sm"
              data-testid="sound-blocked"
            >
              The browser started the video without sound.
            </p>
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
