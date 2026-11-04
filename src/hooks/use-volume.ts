import { useCallback, useState } from 'react';
import { readSetting, writeSetting, type SettingsStorage } from '@/lib/settings-storage';

export interface VolumeControl {
  volume: number;
  setVolume: (volume: number) => void;
}

/**
 * The viewer's volume, remembered between sessions. Only the level is kept:
 * muting is a decision for the moment, and a viewer who muted once should not
 * join the next session wondering why there is no sound.
 */
export function useVolume(storage: SettingsStorage): VolumeControl {
  const [volume, setState] = useState(() => readVolume(storage));

  const setVolume = useCallback(
    (next: number) => {
      setState(next);
      writeSetting(storage, 'volume', String(next));
    },
    [storage],
  );

  return { volume, setVolume };
}

function readVolume(storage: SettingsStorage): number {
  const stored = readSetting(storage, 'volume');
  // `Number('')` is 0, which would start a viewer without sound.
  const value = stored === null || stored.trim() === '' ? NaN : Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}
