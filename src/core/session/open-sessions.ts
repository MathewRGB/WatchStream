const running = new Set<() => void>();

/**
 * Remembers a session that is running, so that the error page can end it. The interface owns the
 * sessions, and when the interface itself fails nobody else would close their connections.
 * `end` closes the session (a host's `close`, a viewer's `leave`). Returns the function that
 * forgets it again, for a session that ended in the usual way.
 */
export function trackSession(end: () => void): () => void {
  running.add(end);
  return () => void running.delete(end);
}

/** Ends every session still running. Called when the interface failed. */
export function endAllSessions(): void {
  for (const end of [...running]) {
    running.delete(end);
    try {
      end();
    } catch {
      // The rest must still be ended.
    }
  }
}
