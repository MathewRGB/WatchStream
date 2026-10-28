import { useCallback, useEffect, useRef, useState } from 'react';
import type { ViewerSession } from '@/core/session/viewer-session';
import { isCaptureCancelled, type CaptureDisplay } from '@/lib/capture';

export interface ViewerShareControls {
  /** Picks a source and asks the host to let the viewer share it. */
  start: () => Promise<void>;
  /** Cancels the request, or ends the share. */
  stop: () => void;
  /** The picker is open. */
  starting: boolean;
  /** Plain-language reason the last start failed, or `null`. */
  error: string | null;
}

/**
 * Lets a viewer pick a source and ask the host to share it. The hook owns the captured
 * tracks: it stops them whenever the share is over, however it ended: the viewer, the browser's
 * own "stop sharing" button, the host saying no or taking it away, or leaving the page.
 */
export function useViewerShare(
  session: ViewerSession,
  capture: CaptureDisplay,
): ViewerShareControls {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    held.current?.getTracks().forEach((track) => track.stop());
    held.current = null;
  }, []);

  const stop = useCallback(() => {
    session.stopSharing();
    release();
  }, [session, release]);

  const start = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await capture();
      release();
      held.current = stream;
      session.requestShare(stream);
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (held.current === stream) stop();
      });
    } catch (caught) {
      release();
      if (!isCaptureCancelled(caught)) setError('Sharing could not be started in this browser.');
    } finally {
      setStarting(false);
    }
  }, [capture, session, release, stop]);

  // The session says when it is over, also when the host ended it: the tracks go with it.
  useEffect(
    () =>
      session.events.on('share', (state) => {
        if (state === 'idle') release();
      }),
    [session, release],
  );
  useEffect(() => release, [release]);

  return { start, stop, starting, error };
}
