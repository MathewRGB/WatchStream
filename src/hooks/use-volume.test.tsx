// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useVolume } from './use-volume';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('useVolume', () => {
  it('starts at full volume when nothing was remembered', () => {
    const { result } = renderHook(() => useVolume(memoryStorage()));

    expect(result.current.volume).toBe(1);
  });

  it('remembers the level for the next time', () => {
    const storage = memoryStorage();
    const first = renderHook(() => useVolume(storage));

    act(() => first.result.current.setVolume(0.35));
    const second = renderHook(() => useVolume(storage));

    expect(first.result.current.volume).toBe(0.35);
    expect(second.result.current.volume).toBe(0.35);
  });

  it.each(['loud', '', '-1', '1.5', 'NaN'])('ignores a stored value of %j', (stored) => {
    const { result } = renderHook(() => useVolume(memoryStorage({ 'watchstream.volume': stored })));

    expect(result.current.volume).toBe(1);
  });

  it('keeps working when the browser refuses to store it', () => {
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('full');
      },
    };
    const { result } = renderHook(() => useVolume(storage));

    act(() => result.current.setVolume(0.2));

    expect(result.current.volume).toBe(0.2);
  });
});
