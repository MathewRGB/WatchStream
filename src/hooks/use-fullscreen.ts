import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export interface FullscreenControls<T extends HTMLElement> {
  /** Attach to the element that should fill the screen. */
  ref: RefObject<T | null>;
  /** The referenced element is currently in full screen. */
  active: boolean;
  /** Full screen is available in this browser and context. */
  supported: boolean;
  toggle: () => Promise<void>;
}

/** Puts one element of the page into full screen and keeps `active` in sync with the browser. */
export function useFullscreen<T extends HTMLElement>(): FullscreenControls<T> {
  const ref = useRef<T>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () =>
      setActive(ref.current !== null && document.fullscreenElement === ref.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await ref.current?.requestFullscreen();
      }
    } catch {
      // The browser refused (no user action, blocked by policy): stay as we are.
    }
  }, []);

  return { ref, active, supported: document.fullscreenEnabled === true, toggle };
}
