import { LoadMonitor, type LinkHealth } from '../media/load-monitor';
import type { MediaLimits, QualityChoice } from '../media/quality';
import type { LinkStats } from '../peer/link-stats';

/** How well the host carries its viewers. */
export interface LoadStatus {
  /** What the host chose in Settings: a step, or its own values. */
  chosen: QualityChoice;
  /** What that comes to, which is what is sent. */
  limits: MediaLimits;
  viewers: number;
  /** The host cannot keep up with its viewers; the picture may reach some of them late. */
  struggling: boolean;
  /** Why the host struggles; `null` while it does not. */
  cause: 'computer' | 'connection' | null;
  /** By participant id; a viewer who is not listed is not known to be slow. */
  health: ReadonlyMap<string, LinkHealth>;
}

/** A link whose picture can be read. */
interface ReadableLink {
  stats(): Promise<LinkStats | null>;
}

export interface LoadControlOptions {
  intervalMs: number;
  /** What the host chose. */
  chosen: () => QualityChoice;
  /** What that comes to; the monitor judges the links against it. */
  limits: () => MediaLimits;
  /** The links that send the picture now, by participant id. */
  links: () => ReadonlyMap<string, ReadableLink>;
  /** A reading was judged; what the host is shown may have changed. */
  onReading: () => void;
}

/**
 * Runs the load monitor while something is sent: reads every link on a timer, lets the monitor
 * judge, and keeps what follows from it for the host to see: whether the host struggles, the cause
 * and who is slow. It never changes the quality; the host does that.
 */
export class LoadControl {
  private readonly monitor = new LoadMonitor();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  /** Counts the resets, so that a reading that was under way during one is dropped. */
  private generation = 0;
  private struggling = false;
  private cause: 'computer' | 'connection' | null = null;
  private health = new Map<string, LinkHealth>();

  constructor(private readonly options: LoadControlOptions) {}

  status(viewers: number): LoadStatus {
    return {
      chosen: this.options.chosen(),
      limits: this.options.limits(),
      viewers,
      struggling: this.struggling,
      cause: this.struggling ? this.cause : null,
      health: this.health,
    };
  }

  start(): void {
    if (this.timer === null)
      this.timer = setInterval(() => void this.read(), this.options.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Starts over, as when the host chooses another quality or the share ends. */
  reset(): void {
    this.generation += 1;
    this.monitor.reset();
    this.struggling = false;
    this.cause = null;
    this.health = new Map();
  }

  /** A viewer has gone; what was known about its link goes too. */
  forget(id: string): void {
    this.monitor.forget(id);
    this.health.delete(id);
  }

  /** One round: read every link, let the monitor judge, and keep what it says. */
  private async read(): Promise<void> {
    const links = this.options.links();
    if (this.reading || links.size === 0) return;
    this.reading = true;
    const generation = this.generation;
    try {
      const readings = new Map<string, LinkStats | null>();
      await Promise.all(
        [...links].map(async ([id, link]) => {
          readings.set(id, await link.stats().catch(() => null));
        }),
      );
      // The share may have ended, or the quality been chosen again, while the links were read.
      if (this.timer === null || generation !== this.generation) return;
      const decision = this.monitor.update({
        readings,
        limits: this.options.limits(),
      });
      this.struggling = decision.struggling;
      if (decision.cause) this.cause = decision.cause;
      this.health = new Map(decision.links);
      this.options.onReading();
    } finally {
      this.reading = false;
    }
  }
}
