/** The slice of `Storage` the settings use; tests pass a plain object. */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The one place a name of a remembered setting is written out. Keys on disk stay `watchstream.*`. */
export const SETTING_KEYS = {
  name: 'watchstream.name',
  volume: 'watchstream.volume',
  playoutBuffer: 'watchstream.playout-buffer',
} as const;

export type SettingKey = keyof typeof SETTING_KEYS;

/** The stored text, or `null` when nothing is stored or the browser refuses to read it. */
export function readSetting(storage: Pick<Storage, 'getItem'>, key: SettingKey): string | null {
  try {
    return storage.getItem(SETTING_KEYS[key]);
  } catch {
    return null;
  }
}

/**
 * Remembers `value`. A full or blocked storage is no error worth stopping for: the setting just is
 * not remembered the next time.
 */
export function writeSetting(storage: Pick<Storage, 'setItem'>, key: SettingKey, value: string) {
  try {
    storage.setItem(SETTING_KEYS[key], value);
  } catch {
    // Storage is full or blocked.
  }
}
