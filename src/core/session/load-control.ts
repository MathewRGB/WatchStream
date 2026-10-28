import { LoadMonitor, type LinkHealth } from '../media/load-monitor';
import { lowerQuality, qualityPreset, stepsBelow, type QualityId } from '../media/quality';
import type { LinkStats } from '../peer/link-stats';

/** How well the host carries its viewers. */
export interface LoadStatus {
  /** What the host chose; the most that is sent. */
  chosen: QualityId;
  /** What is sent now: the chosen step, lowered when the host cannot keep up. */
  effective: QualityId;
  viewers: number;
  /** Why the quality is lowered; `null` while it is not. */
  cause: 'computer' | 'connection' | null;
  /** The host struggles at the lowest step: nothing more can be done. */
  overloaded: boolean;
  /** By participant id; a viewer who is not listed is not known to be slow. */
  health: ReadonlyMap<string, LinkHealth>;
}

/** A link whose picture can be read. */
interface ReadableLink {
  stats(): Promise<LinkStats | null>;
}

export interface LoadControlOptions {
  intervalMs: number;
  /** The quality the host chose. */
  chosen: () => QualityId;
  /** The links that send the picture now, by participant id. */
  links: () => ReadonlyMap<string, ReadableLink>;
  /** The quality that is sent went down or up a step; it has to be applied to every link. */
  onStep: (direction: 'lowered' | 'raised') => void;
  /** A reading was judged; what the host is shown may have changed. */
  onReading: () => void;
}

/**
 * Runs the load monitor while something is sent: reads every link on a timer, lets the
 * monitor judge, and keeps what follows from it, the steps taken off the chosen quality, the cause
 * and who is slow. What to do about a step is the session's business (`onStep`).
 */
export class LoadControl {
  private readonly monitor = new LoadMonitor();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  /** Counts the resets, so that a reading that was under way during one is dropped. */
  private generation = 0;
  /** Steps the monitor has taken off the quality the host chose. */
  private penalty = 0;
  private cause: 'computer' | 'connection' = 'computer';
  private overloaded = false;
  private health = new Map<string, LinkHealth>();

  constructor(private readonly options: LoadControlOptions) {}

  /** What is sent now: the chosen quality, lowered while the host cannot keep up. */
  get effective(): QualityId {
    return lowerQuality(this.options.chosen(), this.penalty);
  }

  status(viewers: number): LoadStatus {
    return {
      chosen: this.options.chosen(),
      effective: this.effective,
      viewers,
      cause: this.penalty > 0 || this.overloaded ? this.cause : null,
      overloaded: this.overloaded,
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
    this.penalty = 0;
    this.overloaded = false;
    this.health = new Map();
  }

  /** A viewer has gone; what was known about its link goes too. */
  forget(id: string): void {
    this.monitor.forget(id);
    this.health.delete(id);
  }

  /** One round: read every link, let the monitor judge, and say when the quality took a step. */
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
        limits: qualityPreset(this.effective),
        stepsAvailable: stepsBelow(this.options.chosen()),
      });
      const before = this.penalty;
      this.penalty = decision.penalty;
      this.overloaded = decision.overloaded;
      this.health = new Map(decision.links);
      if (decision.struggling && decision.cause) this.cause = decision.cause;
      if (this.penalty !== before)
        this.options.onStep(this.penalty > before ? 'lowered' : 'raised');
      this.options.onReading();
    } finally {
      this.reading = false;
    }
  }
}
