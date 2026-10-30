import type { LinkStats } from '../peer/link-stats';

/** Readings closer together than this say too little about a rate. */
const MIN_SECONDS = 0.5;
/** How much of a new reading counts against what was known: a picture's bitrate jumps about. */
const WEIGHT_OF_NEW = 0.5;

/**
 * What the host really sends of the picture to one viewer, in bit/s: the mean over the links, from
 * the change between two readings, smoothed a little. Pure, like the load monitor: readings in,
 * a number out. The limit is a ceiling and a quiet picture uses far less of it, so this is what
 * lets the host see a limit at work.
 */
export class SendRate {
  private previous = new Map<string, LinkStats>();
  private smoothed: number | null = null;

  /** The rate, or `null` while nothing is known yet (no picture, or only one reading). */
  get bps(): number | null {
    return this.smoothed;
  }

  update(readings: ReadonlyMap<string, LinkStats | null>): void {
    const rates: number[] = [];
    for (const [id, now] of readings) {
      if (!now) {
        this.previous.delete(id);
        continue;
      }
      const before = this.previous.get(id);
      this.previous.set(id, now);
      if (!before) continue;
      const seconds = (now.at - before.at) / 1000;
      // A counter that fell started anew (the sender was replaced); this round says nothing.
      if (seconds < MIN_SECONDS || now.bytesSent < before.bytesSent) continue;
      rates.push(((now.bytesSent - before.bytesSent) * 8) / seconds);
    }
    if ([...readings.values()].every((reading) => reading === null)) {
      this.smoothed = null;
      return;
    }
    if (rates.length === 0) return;
    const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    this.smoothed =
      this.smoothed === null ? mean : this.smoothed * (1 - WEIGHT_OF_NEW) + mean * WEIGHT_OF_NEW;
  }

  /** A link has gone; what was known about it goes too. */
  forget(id: string): void {
    this.previous.delete(id);
  }

  /** Starts anew, as when the host chooses another quality or stops sharing. */
  reset(): void {
    this.previous.clear();
    this.smoothed = null;
  }
}
