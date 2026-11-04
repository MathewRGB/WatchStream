import { describe, expect, it } from 'vitest';
import { readSetting, SETTING_KEYS, writeSetting } from './settings-storage';

const refusing = {
  getItem: () => {
    throw new DOMException('blocked', 'SecurityError');
  },
  setItem: () => {
    throw new DOMException('full', 'QuotaExceededError');
  },
};

describe('settings storage', () => {
  it('writes and reads under the keys the extension has always used', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };

    writeSetting(storage, 'name', 'user1');
    writeSetting(storage, 'volume', '0.5');
    writeSetting(storage, 'playoutBuffer', 'short');

    expect([...values]).toEqual([
      ['watchstream.name', 'user1'],
      ['watchstream.volume', '0.5'],
      ['watchstream.playout-buffer', 'short'],
    ]);
    expect(readSetting(storage, 'name')).toBe('user1');
    expect(SETTING_KEYS.volume).toBe('watchstream.volume');
  });

  it('reads null when nothing is stored', () => {
    expect(readSetting({ getItem: () => null }, 'name')).toBeNull();
  });

  it('does not throw when the browser refuses to read or to store', () => {
    expect(readSetting(refusing, 'name')).toBeNull();
    expect(() => writeSetting(refusing, 'name', 'user1')).not.toThrow();
  });
});
