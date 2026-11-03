import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PLAYOUT_BUFFER,
  isPlayoutBufferId,
  type PlayoutBufferId,
} from '@/core/media/playout-buffer';
import type { ViewerSession } from '@/core/session/viewer-session';

const BUFFER_KEY = 'watchstream.playout-buffer';

export interface PlayoutBufferControl {
  buffer: PlayoutBufferId;
  setBuffer: (id: PlayoutBufferId) => void;
}

/**
 * The viewer's playout buffer, remembered between sessions and handed to the session as soon as
 * the view is up, so a viewer who needed a long buffer once does not have to find it again.
 */
export function usePlayoutBuffer(
  session: ViewerSession,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
): PlayoutBufferControl {
  const [buffer, setState] = useState<PlayoutBufferId>(() => readBuffer(storage));

  useEffect(() => {
    session.setPlayoutBuffer(buffer);
  }, [session, buffer]);

  const setBuffer = useCallback(
    (next: PlayoutBufferId) => {
      setState(next);
      try {
        storage.setItem(BUFFER_KEY, next);
      } catch {
        // Storage is full or blocked; the choice just is not remembered.
      }
    },
    [storage],
  );

  return { buffer, setBuffer };
}

function readBuffer(storage: Pick<Storage, 'getItem'>): PlayoutBufferId {
  try {
    const stored = storage.getItem(BUFFER_KEY);
    return isPlayoutBufferId(stored) ? stored : DEFAULT_PLAYOUT_BUFFER;
  } catch {
    return DEFAULT_PLAYOUT_BUFFER;
  }
}
