import { createLogger, describeThrown } from '../log/logger';

export type Listener<T> = (payload: T) => void;

const log = createLogger('events');

/**
 * Minimal typed event emitter. `on` returns a function that unsubscribes. A listener that throws
 * is logged and skipped: the others still get the event, and the code that emitted it (a link
 * closing, a session ending) carries on.
 */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => set.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        log.error('a listener failed', { event: String(event), ...describeThrown(error) });
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
