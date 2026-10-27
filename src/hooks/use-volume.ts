import { useCallback, useState } from 'react';

const VOLUME_KEY = 'watchstream.volume';

export interface VolumeControl {
  volume: number;
  setVolume: (volume: number) => void;
}

/**
 * The viewer's volume, remembered between sessions. Only the level is kept:
 * muting is a decision for the moment, and a viewer who muted once should not
 * join the next session wondering why there is no sound.
 */
export function useVolume(storage: Pick<Storage, 'getItem' | 'setItem'>): VolumeControl {
  const [volume, setState] = useState(() => readVolume(storage));

  const setVolume = useCallback(
    (next: number) => {
      setState(next);
      try {
        storage.setItem(VOLUME_KEY, String(next));
      } catch {
        // Storage is full or blocked; the level just is not remembered.
      }
    },
    [storage],
  );

  return { volume, setVolume };
}

function readVolume(storage: Pick<Storage, 'getItem'>): number {
  try {
    const stored = storage.getItem(VOLUME_KEY);
    // `Number('')` is 0, which would start a viewer without sound.
    const value = stored === null || stored.trim() === '' ? NaN : Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
  } catch {
    return 1;
  }
}
