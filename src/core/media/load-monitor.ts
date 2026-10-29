import type { LinkStats } from '../peer/link-stats';
import type { MediaLimits } from './quality';

/**
 * The thresholds of the load monitor. First guesses, in one place so they can be tuned
 * against measurements.
 */
export const LOAD_RULES = {
  /** A link is behind when it encodes fewer than this share of the frames it should. */
  behindBelow: 0.8,
  /** Below this many frames a second a source is too quiet to tell anything (a still picture). */
  minExpectedFps: 5,
  /** A link is squeezed when its available bitrate is under this share of the cap ... */
  squeezedBelow: 0.7,
  /** ... and it already sends at least this share of what is available. */
  usingAtLeast: 0.7,
  /** ... or when more than this share of its packets is lost. */
  lossAbove: 0.05,
  /** The first seconds of a link say nothing: the browser is still finding its rate. */
  graceMs: 8_000,
  /** Readings closer together than this are not compared. */
  minIntervalMs: 500,
  /** Readings in a row with the host struggling before the host is told so. */
  readingsToReport: 3,
} as const;

export type LinkHealth = 'good' | 'slow';

export interface LoadDecision {
  /** The host has struggled for enough readings in a row to be told so. */
  struggling: boolean;
  /** When struggling: do most affected links lag in encoding (the computer) or lose packets (the connection)? */
  cause: 'computer' | 'connection' | null;
  /** Per link: slow when it is affected and the host as a whole is not, or even when it is. */
  links: ReadonlyMap<string, LinkHealth>;
}

export interface LoadInput {
  /** The latest reading of each link, `null` for a link without a picture. */
  readings: ReadonlyMap<string, LinkStats | null>;
  /** What the links are limited to; frames and bitrate are judged against it. */
  limits: MediaLimits;
}

/** How many affected links make the host struggle: all of one or two, else half of them. */
function needed(links: number): number {
  return links <= 2 ? links : Math.ceil(links / 2);
}

/**
 * Finds out whether the host can keep up with its viewers by what it delivers, not by what the
 * browser says about it (measured: `qualityLimitationReason` read "none" at 2 frames a second).
 * Pure: readings in, a decision out. The time comes from the readings.
 */
export class LoadMonitor {
  private previous = new Map<string, LinkStats>();
  private firstSeen = new Map<string, number>();
  private strikes = 0;

  update({ readings, limits }: LoadInput): LoadDecision {
    const links = new Map<string, LinkHealth>();
    let now = Number.NEGATIVE_INFINITY;
    for (const stats of readings.values()) if (stats) now = Math.max(now, stats.at);
    for (const id of [...this.previous.keys()]) if (!readings.get(id)) this.forget(id);
    if (now === Number.NEGATIVE_INFINITY) return this.decision(links, false, null);

    let evaluated = 0;
    let behindCount = 0;
    let affectedCount = 0;
    for (const [id, current] of readings) {
      if (!current) continue;
      links.set(id, 'good');
      this.firstSeen.set(id, this.firstSeen.get(id) ?? current.at);
      const before = this.previous.get(id);
      const settled = current.at - this.firstSeen.get(id)! >= LOAD_RULES.graceMs;
      const seconds = before ? (current.at - before.at) / 1000 : 0;
      if (!before || seconds < LOAD_RULES.minIntervalMs / 1000) {
        this.previous.set(id, before ?? current);
        continue;
      }
      this.previous.set(id, current);
      // A counter that fell started anew (the sender was replaced); this round says nothing.
      if (current.framesEncoded < before.framesEncoded || current.bytesSent < before.bytesSent) {
        continue;
      }
      if (!settled) continue;

      evaluated += 1;
      const behind = this.isBehind(before, current, seconds, limits);
      const squeezed = this.isSqueezed(before, current, seconds, limits);
      if (behind || squeezed) {
        links.set(id, 'slow');
        affectedCount += 1;
        if (behind) behindCount += 1;
      }
    }

    const struggling = evaluated > 0 && affectedCount >= needed(evaluated);
    const cause = struggling
      ? behindCount * 2 >= affectedCount
        ? 'computer'
        : 'connection'
      : null;
    this.strikes = struggling ? this.strikes + 1 : 0;
    const reported = this.strikes >= LOAD_RULES.readingsToReport;
    return this.decision(links, reported, reported ? cause : null);
  }

  /** A link has gone; what was known about it goes too. */
  forget(id: string): void {
    this.previous.delete(id);
    this.firstSeen.delete(id);
  }

  /** Starts anew, as when the host chooses another quality or stops sharing. */
  reset(): void {
    this.previous.clear();
    this.firstSeen.clear();
    this.strikes = 0;
  }

  private decision(
    links: ReadonlyMap<string, LinkHealth>,
    struggling: boolean,
    cause: LoadDecision['cause'],
  ): LoadDecision {
    return { struggling, cause, links };
  }

  /**
   * The encoder gives out fewer frames than it should. "Should" is what the source produced, up to
   * the limit: a still picture produces few frames and is not behind.
   */
  private isBehind(before: LinkStats, now: LinkStats, seconds: number, limits: MediaLimits) {
    if (now.sourceFrames === null || before.sourceFrames === null) return false;
    const expected = Math.min(
      (now.sourceFrames - before.sourceFrames) / seconds,
      limits.maxFramerate,
    );
    if (expected < LOAD_RULES.minExpectedFps) return false;
    const encoded = (now.framesEncoded - before.framesEncoded) / seconds;
    return encoded < LOAD_RULES.behindBelow * expected;
  }

  /**
   * The connection holds the picture back. Few bits sent are no sign: a quiet picture is cheap, and
   * the browser's estimate of what is available does not climb while little is sent. So the
   * estimate counts only when the link already uses most of it.
   */
  private isSqueezed(before: LinkStats, now: LinkStats, seconds: number, limits: MediaLimits) {
    if (now.lossFraction !== null && now.lossFraction > LOAD_RULES.lossAbove) return true;
    if (now.availableBps === null) return false;
    const sent = ((now.bytesSent - before.bytesSent) * 8) / seconds;
    return (
      now.availableBps < LOAD_RULES.squeezedBelow * limits.maxBitrateBps &&
      sent >= LOAD_RULES.usingAtLeast * now.availableBps
    );
  }
}
