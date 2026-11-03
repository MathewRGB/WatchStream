import { isSelectedPair, statNumber as number, type StatsEntry } from './stats-report';

/**
 * What the host's load monitor needs to know about one link's picture. Plain counters,
 * so the monitor works on the change between two readings and never touches WebRTC.
 */
export interface LinkStats {
  /** Milliseconds on one clock for all readings of one link. */
  at: number;
  /** Frames the encoder has produced for this link. */
  framesEncoded: number;
  /** Frames the source (the capture) has produced; `null` if the browser does not say. */
  sourceFrames: number | null;
  bytesSent: number;
  /** What the connection estimates it can send; `null` where the browser has no such number. */
  availableBps: number | null;
  /** Share of this link's packets lost, 0 to 1, as the viewer reports it; `null` if not known. */
  lossFraction: number | null;
  rttMs: number | null;
  /** Why the browser holds the picture back (`bandwidth`, `cpu`, `none`); `null` if not said. */
  limitationReason?: string | null;
  /** The bitrate the encoder aims at right now, in bit/s. */
  targetBps?: number | null;
  /** Height in pixels of the frames being encoded, after the browser's own scaling. */
  frameHeight?: number | null;
  /** Frames a second the encoder produces right now. */
  framesPerSecond?: number | null;
}

/**
 * Picks the numbers out of the reports of a connection that sends one picture. `null` while there
 * is no video sender (nothing is shared yet).
 */
export function readLinkStats(reports: Iterable<object>, at: number): LinkStats | null {
  let outbound: StatsEntry | undefined;
  let source: StatsEntry | undefined;
  let remote: StatsEntry | undefined;
  let pair: StatsEntry | undefined;
  for (const item of reports) {
    const report = item as StatsEntry;
    const video = report.kind === 'video';
    if (report.type === 'outbound-rtp' && video) outbound ??= report;
    else if (report.type === 'media-source' && video) source ??= report;
    else if (report.type === 'remote-inbound-rtp' && video) remote ??= report;
    else if (isSelectedPair(report)) pair ??= report;
  }
  if (!outbound) return null;

  const rttSeconds = number(remote?.roundTripTime) ?? number(pair?.currentRoundTripTime);
  return {
    at,
    framesEncoded: number(outbound.framesEncoded) ?? 0,
    sourceFrames: number(source?.frames),
    bytesSent: number(outbound.bytesSent) ?? 0,
    availableBps: number(pair?.availableOutgoingBitrate),
    lossFraction: number(remote?.fractionLost),
    rttMs: rttSeconds === null ? null : rttSeconds * 1000,
    limitationReason:
      typeof outbound.qualityLimitationReason === 'string'
        ? outbound.qualityLimitationReason
        : null,
    targetBps: number(outbound.targetBitrate),
    frameHeight: number(outbound.frameHeight),
    framesPerSecond: number(outbound.framesPerSecond),
  };
}
