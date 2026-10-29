import { useCallback, useEffect, useState } from 'react';
import type { HostSession } from '@/core/session/host-session';
import { isCaptureCancelled, type CaptureDisplay } from '@/lib/capture';

/** Where a share without sound can still get some (Firefox: the sound of the playing tab). */
export interface AutoSound {
  /** Runs first thing in the click, before the picker; may ask the host for access. */
  prepare: () => Promise<void>;
  /** Runs when the share came without sound. */
  track: () => Promise<MediaStreamTrack | null>;
}

export interface ScreenShareControls {
  start: () => Promise<void>;
  stop: () => void;
  /** The picker is open or the share is being set up. */
  starting: boolean;
  /** Plain-language reason the last start failed, or `null`. */
  error: string | null;
}

/**
 * Lets the host pick a source and share it. The hook owns the captured tracks:
 * it stops them when the share ends, whether the host, the browser's own "stop
 * sharing" button or leaving the page ended it. `tabSoundTrack` supplies a track for a share that
 * came without sound.
 */
export function useScreenShare(
  session: HostSession,
  capture: CaptureDisplay,
  tabSoundTrack: () => MediaStreamTrack | null = () => null,
  autoSound?: AutoSound,
): ScreenShareControls {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    const stream = session.sharedStream;
    session.stopSharing();
    stream?.getTracks().forEach((track) => track.stop());
  }, [session]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      // Before the picker: asking for access needs the click, and happens once.
      await autoSound?.prepare().catch(() => undefined);
      const stream = await capture();
      // Firefox shares no sound of its own; the sound taken from a tab fills that gap.
      if (stream.getAudioTracks().length === 0) {
        const sound = tabSoundTrack();
        if (sound) stream.addTrack(sound);
      }
      if (stream.getAudioTracks().length === 0 && autoSound) {
        const sound = await autoSound.track().catch(() => null);
        if (sound) stream.addTrack(sound);
      }
      stop();
      session.startSharing(stream);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (session.sharedStream === stream) stop();
      });
    } catch (caught) {
      if (!isCaptureCancelled(caught)) setError('Sharing could not be started in this browser.');
    } finally {
      setStarting(false);
    }
  }, [autoSound, capture, session, stop, tabSoundTrack]);

  useEffect(
    () => () => {
      session.sharedStream?.getTracks().forEach((track) => track.stop());
    },
    [session],
  );

  return { start, stop, starting, error };
}
