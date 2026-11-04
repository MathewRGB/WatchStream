import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_PLAYOUT_BUFFER,
  isPlayoutBufferId,
  type PlayoutBufferId,
} from '@/core/media/playout-buffer';
import type { ViewerSession } from '@/core/session/viewer-session';
import { readSetting, writeSetting, type SettingsStorage } from '@/lib/settings-storage';

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
  storage: SettingsStorage,
): PlayoutBufferControl {
  const [buffer, setState] = useState<PlayoutBufferId>(() => readBuffer(storage));

  useEffect(() => {
    session.setPlayoutBuffer(buffer);
  }, [session, buffer]);

  const setBuffer = useCallback(
    (next: PlayoutBufferId) => {
      setState(next);
      writeSetting(storage, 'playoutBuffer', next);
    },
    [storage],
  );

  return { buffer, setBuffer };
}

function readBuffer(storage: SettingsStorage): PlayoutBufferId {
  const stored = readSetting(storage, 'playoutBuffer');
  return isPlayoutBufferId(stored) ? stored : DEFAULT_PLAYOUT_BUFFER;
}
