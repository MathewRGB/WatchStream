// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_MS, useNotice } from './use-notice';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function setup(count = 0, enabled = true) {
  return renderHook(({ n, on }) => useNotice(n, on), { initialProps: { n: count, on: enabled } });
}

describe('useNotice', () => {
  it('shows nothing at first, whatever the count it starts with', () => {
    const { result } = setup(7);

    expect(result.current).toBe(false);
  });

  it('shows for exactly one second when the count grows', () => {
    const { result, rerender } = setup(0);

    rerender({ n: 1, on: true });
    expect(result.current).toBe(true);

    wait(NOTICE_MS - 1);
    expect(result.current).toBe(true);
    wait(1);
    expect(result.current).toBe(false);
  });

  it('starts the second over when another one comes in time', () => {
    const { result, rerender } = setup(0);
    rerender({ n: 1, on: true });
    wait(700);

    rerender({ n: 2, on: true });
    wait(700);
    expect(result.current).toBe(true);

    wait(300);
    expect(result.current).toBe(false);
  });

  it('shows again for a later one', () => {
    const { result, rerender } = setup(0);
    rerender({ n: 1, on: true });
    wait(NOTICE_MS);
    expect(result.current).toBe(false);

    rerender({ n: 2, on: true });

    expect(result.current).toBe(true);
  });

  it('does not show when the count grows while it is not enabled, not even later', () => {
    const { result, rerender } = setup(0, false);

    rerender({ n: 1, on: false });
    expect(result.current).toBe(false);

    rerender({ n: 1, on: true });
    expect(result.current).toBe(false);
    wait(NOTICE_MS * 2);
    expect(result.current).toBe(false);
  });

  it('goes at once when it is no longer enabled', () => {
    const { result, rerender } = setup(0);
    rerender({ n: 1, on: true });
    expect(result.current).toBe(true);

    rerender({ n: 1, on: false });

    expect(result.current).toBe(false);
  });

  it('ignores a count that falls', () => {
    const { result, rerender } = setup(5);

    rerender({ n: 3, on: true });

    expect(result.current).toBe(false);
  });

  it('leaves no timer behind when unmounted', () => {
    const { rerender, unmount } = setup(0);
    rerender({ n: 1, on: true });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
