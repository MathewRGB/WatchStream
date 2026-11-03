import { LoadMonitor, type LinkHealth } from '../media/load-monitor';
import { SendRate } from '../media/send-rate';
import type { MediaLimits, QualityChoice } from '../media/quality';
import { createLogger } from '../log/logger';
import type { LinkStats } from '../peer/link-stats';

const log = createLogger('load');
/** One log line per link every this many rounds, so the history is not flooded. */
const LOG_EVERY_ROUNDS = 5;

const kbps = (bps: number | null | undefined): number | null =>
  bps === null || bps === undefined ? null : Math.round(bps / 1000);

/** How well the host carries its viewers. */
export interface LoadStatus {
  /** What the host chose in Settings: a step, or its own values. */
  chosen: QualityChoice;
  /** What that comes to, which is what is sent. */
  limits: MediaLimits;
  /**
   * What each viewer really gets of the picture, in bit/s: the mean over the links. The limit is a
   * ceiling and a quiet picture uses less of it. `null` while it is not known yet.
   */
  sendingBps: number | null;
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
  private readonly rate = new SendRate();
  private timer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  private rounds = 0;
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
      sendingBps: this.rate.bps,
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
    this.rate.reset();
    this.struggling = false;
    this.cause = null;
    this.health = new Map();
  }

  /** A viewer has gone; what was known about its link goes too. */
  forget(id: string): void {
    this.monitor.forget(id);
    this.rate.forget(id);
    this.health.delete(id);
  }

  /**
   * Every few rounds one line per link with what the browser says about the connection, so a
   * picture that falls apart after a while can be read afterwards: the estimate against the cap,
   * the loss, the round trip and why the encoder holds back. Counts and enums only.
   */
  private logReadings(readings: ReadonlyMap<string, LinkStats | null>): void {
    this.rounds += 1;
    if (this.rounds % LOG_EVERY_ROUNDS !== 0) return;
    const cap = this.options.limits().maxBitrateBps;
    let index = 0;
    for (const reading of readings.values()) {
      index += 1;
      if (!reading) continue;
      log.info('link reading', {
        link: index,
        capKbps: Math.round(cap / 1000),
        estimateKbps: kbps(reading.availableBps),
        targetKbps: kbps(reading.targetBps),
        sentKbps: kbps(this.rate.bps),
        lossPercent: reading.lossFraction === null ? null : Math.round(reading.lossFraction * 100),
        rttMs: reading.rttMs === null ? null : Math.round(reading.rttMs),
        height: reading.frameHeight ?? null,
        fps: reading.framesPerSecond === null ? null : Math.round(reading.framesPerSecond ?? 0),
        limit: reading.limitationReason ?? null,
        pli: reading.pliCount ?? null,
        nack: reading.nackCount ?? null,
        keyFrames: reading.keyFramesEncoded ?? null,
        resentKB:
          reading.retransmittedBytes === null || reading.retransmittedBytes === undefined
            ? null
            : Math.round(reading.retransmittedBytes / 1000),
        path: reading.path ?? null,
      });
    }
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
      this.rate.update(readings);
      this.logReadings(readings);
      this.struggling = decision.struggling;
      if (decision.cause) this.cause = decision.cause;
      this.health = new Map(decision.links);
      this.options.onReading();
    } finally {
      this.reading = false;
    }
  }
}
