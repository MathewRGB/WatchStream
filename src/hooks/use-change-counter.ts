import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Emitter } from '@/core/events/emitter';

export type Subscribe = (onChange: () => void) => () => void;

/** Calls `onChange` on any of the named events; the returned function unsubscribes from all. */
export function onAnyOf<Events extends object>(
  events: Pick<Emitter<Events>, 'on'>,
  names: readonly (keyof Events)[],
  onChange: () => void,
): () => void {
  const offs = names.map((name) => events.on(name, onChange));
  return () => offs.forEach((off) => off());
}

/**
 * Re-renders the component whenever `subscribe`'s source reports a change.
 *
 * The core objects (sessions) are mutable and hand out fresh arrays from their
 * getters, which `useSyncExternalStore` cannot use as a snapshot. So the
 * snapshot is a counter, and the component reads the getters while rendering.
 * `subscribe` must be stable (wrap it in `useCallback`).
 */
export function useChangeCounter(subscribe: Subscribe): number {
  const version = useRef(0);
  const subscribeCounting = useCallback<Subscribe>(
    (onChange) =>
      subscribe(() => {
        version.current += 1;
        onChange();
      }),
    [subscribe],
  );
  return useSyncExternalStore(subscribeCounting, () => version.current);
}
