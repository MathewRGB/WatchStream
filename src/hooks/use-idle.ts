import { useEffect, useRef, useState } from 'react';

/** How long nothing may happen before the controls leave the picture alone. */
export const IDLE_DELAY_MS = 3_000;

/** What says a person is there. A touch begins with `pointerdown`. */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;

/**
 * True once nothing has happened for `delayMs` while `enabled`, false again at the first sign of
 * activity. `isHeld` is asked when the time is up: while it says yes (the pointer rests on
 * something a person is reading) the wait starts over.
 */
export function useIdle(
  enabled: boolean,
  isHeld: () => boolean = () => false,
  delayMs = IDLE_DELAY_MS,
): boolean {
  const [idle, setIdle] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const held = useRef(isHeld);

  // Starting or stopping starts from "not idle", whatever happened before.
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setIdle(false);
  }

  useEffect(() => {
    held.current = isHeld;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastActivity = Date.now();
    let lastPoint: { x: number; y: number } | null = null;
    let isIdle = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const wait = (ms: number) => {
      timer = setTimeout(check, ms);
    };
    const check = () => {
      const quiet = Date.now() - lastActivity;
      if (quiet >= delayMs && !held.current()) {
        isIdle = true;
        timer = null;
        setIdle(true);
      } else {
        wait(quiet >= delayMs ? delayMs : delayMs - quiet);
      }
    };
    const onActivity = (event: Event) => {
      if (event.type === 'pointermove') {
        // A browser sends a move with the same position when the element under a resting pointer
        // changes, which hiding the controls does. That is not a person.
        const { clientX: x, clientY: y } = event as PointerEvent;
        if (lastPoint?.x === x && lastPoint.y === y) return;
        lastPoint = { x, y };
      }
      lastActivity = Date.now();
      if (isIdle) {
        isIdle = false;
        setIdle(false);
        wait(delayMs);
      }
    };

    wait(delayMs);
    for (const type of ACTIVITY_EVENTS) document.addEventListener(type, onActivity, true);
    return () => {
      if (timer !== null) clearTimeout(timer);
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, onActivity, true);
    };
  }, [enabled, delayMs]);

  return enabled && idle;
}
