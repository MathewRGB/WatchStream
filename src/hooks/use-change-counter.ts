import { useCallback, useRef, useSyncExternalStore } from 'react';

export type Subscribe = (onChange: () => void) => () => void;

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
