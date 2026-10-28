import { useEffect, useState } from 'react';

/** How long the symbol stays. */
export const NOTICE_MS = 1_000;

/**
 * True for `durationMs` each time `count` grows while `enabled`; a further increase in the
 * meantime starts the time over. A count that grows while not enabled is only noted, so it does
 * not show up later, and neither does the count a component starts with.
 */
export function useNotice(count: number, enabled: boolean, durationMs = NOTICE_MS): boolean {
  const [seen, setSeen] = useState(count);
  const [raised, setRaised] = useState(0);
  const [expired, setExpired] = useState(0);

  if (count !== seen) {
    setSeen(count);
    if (enabled && count > seen) setRaised(raised + 1);
  }

  useEffect(() => {
    if (raised === 0) return;
    const timer = setTimeout(() => setExpired(raised), durationMs);
    return () => clearTimeout(timer);
  }, [raised, durationMs]);

  return enabled && raised > expired;
}
