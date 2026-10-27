import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StageVideoProps {
  stream: MediaStream;
  /** Who shares, shown in a corner. */
  label?: string;
  /**
   * No sound at all and no mute button, e.g. the host's own preview. The element gets a copy of
   * the stream without its audio tracks, so nothing can play, whatever the browser does with a
   * muted element: the host hears the shared tab itself, a second copy would be an echo.
   */
  silent?: boolean;
}

/**
 * Plays a shared stream on the stage. If the browser refuses to start it with
 * sound, it plays muted and says so, so the picture is never stuck.
 */
export function StageVideo({ stream, label, silent = false }: StageVideoProps) {
  const source = useMemo(
    () => (silent ? new MediaStream(stream.getVideoTracks()) : stream),
    [stream, silent],
  );
  const video = useRef<HTMLVideoElement>(null);
  const [soundOff, setSoundOff] = useState(silent);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = source;
  }, [source]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.muted = soundOff;
    void Promise.resolve(element.play?.()).catch(() => {
      if (!soundOff) {
        setSoundOff(true);
        setBlocked(true);
      }
    });
  }, [source, soundOff]);

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
          className="absolute bottom-3 left-3 rounded-md bg-background/70 px-2 py-1 text-sm"
          data-testid="stage-label"
        >
          {label}
        </p>
      )}
      {!silent && (
        <div className="absolute right-3 bottom-3 flex items-center gap-2">
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
            onClick={() => {
              setBlocked(false);
              setSoundOff((off) => !off);
            }}
            data-testid="sound-button"
          >
            {soundOff ? <VolumeX /> : <Volume2 />}
          </Button>
        </div>
      )}
    </>
  );
}
