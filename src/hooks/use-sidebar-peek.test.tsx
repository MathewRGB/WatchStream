// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import type { FocusEvent, PointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIDE_DELAY_MS, useSidebarPeek } from './use-sidebar-peek';

const pointer = (pointerType = 'mouse') => ({ pointerType }) as PointerEvent<HTMLElement>;

function blur(panel: HTMLElement, relatedTarget: Element | null) {
  return { currentTarget: panel, relatedTarget } as unknown as FocusEvent<HTMLElement>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function setup(enabled = true) {
  return renderHook(({ on }) => useSidebarPeek(on), { initialProps: { on: enabled } });
}

describe('useSidebarPeek', () => {
  it('starts closed', () => {
    const { result } = setup();

    expect(result.current.open).toBe(false);
  });

  it('opens when the pointer touches the edge', () => {
    const { result } = setup();

    act(() => result.current.hoverProps.onPointerEnter(pointer()));

    expect(result.current.open).toBe(true);
  });

  it('closes a moment after the pointer left, not at once', () => {
    const { result } = setup();
    act(() => result.current.hoverProps.onPointerEnter(pointer()));

    act(() => result.current.hoverProps.onPointerLeave(pointer()));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS - 1));
    expect(result.current.open).toBe(true);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.open).toBe(false);
  });

  it('stays when the pointer comes back in time, as when it moves from the edge into the sidebar', () => {
    const { result } = setup();
    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => result.current.hoverProps.onPointerLeave(pointer()));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS - 50));

    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 3));

    expect(result.current.open).toBe(true);
  });

  it('stays open while something inside has focus, and closes after focus has left', () => {
    const { result } = setup();
    const panel = document.body.appendChild(document.createElement('aside'));
    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => result.current.focusProps.onFocus());

    act(() => result.current.hoverProps.onPointerLeave(pointer()));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 5));
    expect(result.current.open).toBe(true);

    act(() => result.current.focusProps.onBlur(blur(panel, null)));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS));
    expect(result.current.open).toBe(false);
  });

  it('does not count focus moving between two things inside as leaving', () => {
    const { result } = setup();
    const panel = document.body.appendChild(document.createElement('aside'));
    const inside = panel.appendChild(document.createElement('button'));
    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => result.current.focusProps.onFocus());
    act(() => result.current.hoverProps.onPointerLeave(pointer()));

    act(() => result.current.focusProps.onBlur(blur(panel, inside)));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 5));

    expect(result.current.open).toBe(true);
  });

  it('is not closed by the finger that lifts after a tap', () => {
    const { result } = setup();
    act(() => result.current.hoverProps.onPointerEnter(pointer('touch')));

    act(() => result.current.hoverProps.onPointerLeave(pointer('touch')));
    act(() => vi.advanceTimersByTime(HIDE_DELAY_MS * 5));

    expect(result.current.open).toBe(true);
  });

  it('closes on a press outside, and not on a press inside', () => {
    const { result } = setup();
    const panel = document.body.appendChild(document.createElement('aside'));
    const inside = panel.appendChild(document.createElement('button'));
    const outside = document.body.appendChild(document.createElement('div'));
    result.current.panelRef.current = panel;
    act(() => result.current.hoverProps.onPointerEnter(pointer('touch')));

    act(() => void inside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(result.current.open).toBe(true);

    act(() => void outside.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    expect(result.current.open).toBe(false);
  });

  it('can be revealed by other means', () => {
    const { result } = setup();

    act(() => result.current.reveal());

    expect(result.current.open).toBe(true);
  });

  it('does nothing where it is not enabled', () => {
    const { result } = setup(false);

    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => result.current.reveal());

    expect(result.current.open).toBe(false);
  });

  it('starts closed again after leaving and re-entering full screen', () => {
    const { result, rerender } = setup();
    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    expect(result.current.open).toBe(true);

    rerender({ on: false });
    rerender({ on: true });

    expect(result.current.open).toBe(false);
  });

  it('leaves no timer behind when it is unmounted while waiting to close', () => {
    const { result, unmount } = setup();
    act(() => result.current.hoverProps.onPointerEnter(pointer()));
    act(() => result.current.hoverProps.onPointerLeave(pointer()));
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
