import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/** How long the sidebar stays after the pointer left it, so a slip off the edge does not close it. */
export const HIDE_DELAY_MS = 400;

/** Shows or hides the sidebar in full screen where the pointer cannot reach the edge. */
export const SHORTCUT_KEY = 's';

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export interface SidebarPeek {
  /** The sidebar is shown (only ever true while `enabled`). */
  open: boolean;
  /** Attach to the sidebar element: a press outside it closes it. */
  panelRef: RefObject<HTMLElement | null>;
  /** Show it now. */
  reveal: () => void;
  /** Show it, or close it when it is shown. */
  toggle: () => void;
  /** Handlers for the edge strip and for the sidebar itself. */
  hoverProps: {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
  };
  /** Handlers for the sidebar: it stays while something inside has focus (a half-typed message). */
  focusProps: {
    onFocus: () => void;
    onBlur: (event: FocusEvent<HTMLElement>) => void;
  };
}

/**
 * A sidebar that slides in when the pointer touches the screen edge and goes away again shortly
 * after the pointer left, unless it has focus. It exists only where `enabled` (full screen).
 */
export function useSidebarPeek(enabled: boolean, hideDelayMs = HIDE_DELAY_MS): SidebarPeek {
  const [open, setOpen] = useState(false);
  const [wasEnabled, setWasEnabled] = useState(enabled);
  const panelRef = useRef<HTMLElement | null>(null);
  const hovering = useRef(false);
  const focusWithin = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Leaving or entering full screen starts from a closed sidebar, whatever happened before.
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled);
    setOpen(false);
  }

  const cancelClose = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const close = useCallback(() => {
    cancelClose();
    hovering.current = false;
    focusWithin.current = false;
    setOpen(false);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    if (hovering.current || focusWithin.current) return;
    timer.current = setTimeout(() => setOpen(false), hideDelayMs);
  }, [cancelClose, hideDelayMs]);

  const reveal = useCallback(() => {
    if (!enabled) return;
    cancelClose();
    setOpen(true);
  }, [enabled, cancelClose]);

  const toggle = useCallback(() => (open ? close() : reveal()), [open, close, reveal]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== SHORTCUT_KEY) return;
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      event.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, toggle]);

  // A press outside closes it. Mainly for touch, which has no "pointer left" to wait for.
  useEffect(() => {
    if (!enabled || !open) return;
    const onPress = (event: Event) => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPress);
    return () => document.removeEventListener('pointerdown', onPress);
  }, [enabled, open, close]);

  useEffect(() => cancelClose, [cancelClose, enabled]);

  return {
    open: enabled && open,
    panelRef,
    reveal,
    toggle,
    hoverProps: {
      onPointerEnter: () => {
        hovering.current = true;
        reveal();
      },
      onPointerLeave: (event) => {
        // A finger lifts right after the tap that opened it; that is no reason to close.
        if (event.pointerType === 'touch') return;
        hovering.current = false;
        scheduleClose();
      },
    },
    focusProps: {
      onFocus: () => {
        focusWithin.current = true;
        cancelClose();
      },
      onBlur: (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        focusWithin.current = false;
        scheduleClose();
      },
    },
  };
}
