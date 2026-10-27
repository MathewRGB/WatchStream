// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_DELAY_MS, useIdle } from './use-idle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

function move(x: number, y: number) {
  act(() => {
    document.dispatchEvent(
      new MouseEvent('pointermove', { clientX: x, clientY: y, bubbles: true }),
    );
  });
}

function press(type: 'keydown' | 'pointerdown' | 'wheel') {
  act(() => void document.dispatchEvent(new Event(type, { bubbles: true })));
}

describe('useIdle', () => {
  it('is not idle at first', () => {
    const { result } = renderHook(() => useIdle(true));

    expect(result.current).toBe(false);
  });

  it('is idle once nothing happened for the delay, not before', () => {
    const { result } = renderHook(() => useIdle(true));

    wait(IDLE_DELAY_MS - 1);
    expect(result.current).toBe(false);

    wait(1);
    expect(result.current).toBe(true);
  });

  it('is active again at the first move of the pointer, and idle again after another delay', () => {
    const { result } = renderHook(() => useIdle(true));
    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);

    move(10, 10);
    expect(result.current).toBe(false);

    wait(IDLE_DELAY_MS - 1);
    expect(result.current).toBe(false);
    wait(1);
    expect(result.current).toBe(true);
  });

  it('puts the wait off with every sign of activity', () => {
    const { result } = renderHook(() => useIdle(true));

    wait(IDLE_DELAY_MS - 500);
    move(1, 1);
    wait(IDLE_DELAY_MS - 500);
    move(2, 2);
    wait(IDLE_DELAY_MS - 500);

    expect(result.current).toBe(false);
    wait(500);
    expect(result.current).toBe(true);
  });

  it.each(['keydown', 'pointerdown', 'wheel'] as const)('counts %s as activity', (type) => {
    const { result } = renderHook(() => useIdle(true));
    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);

    press(type);

    expect(result.current).toBe(false);
  });

  it('does not count a move to the position the pointer already has', () => {
    const { result } = renderHook(() => useIdle(true));
    move(50, 60);
    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);

    // The browser's own move after the controls went away.
    move(50, 60);

    expect(result.current).toBe(true);
    move(51, 60);
    expect(result.current).toBe(false);
  });

  it('waits again instead of going idle while something is held', () => {
    let held = true;
    const { result } = renderHook(() => useIdle(true, () => held));

    wait(IDLE_DELAY_MS * 3);
    expect(result.current).toBe(false);

    held = false;
    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);
  });

  it('is never idle where it is not enabled', () => {
    const { result } = renderHook(() => useIdle(false));

    wait(IDLE_DELAY_MS * 5);

    expect(result.current).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts from "not idle" each time it is enabled', () => {
    const { result, rerender } = renderHook(({ on }) => useIdle(on), {
      initialProps: { on: true },
    });
    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);

    rerender({ on: false });
    expect(result.current).toBe(false);
    rerender({ on: true });
    expect(result.current).toBe(false);

    wait(IDLE_DELAY_MS);
    expect(result.current).toBe(true);
  });

  it('leaves no timer and no listener behind when unmounted', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const { unmount } = renderHook(() => useIdle(true));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('pointermove', expect.any(Function), true);
  });
});
