import { isSelectedPair, statNumber as number, type StatsEntry } from './stats-report';

/**
 * What a viewer can tell about the picture it receives. The host cannot see this side: its own
 * counters say what it sent, not what arrived, how long the viewer waits to show it or how often
 * the picture froze. Plain counters, so the summary works on the change between two readings and
 * never touches WebRTC.
 */
export interface ReceiveStats {
  /** Milliseconds on one clock for all readings of one link. */
  at: number;
  packetsReceived: number;
  packetsLost: number;
  bytesReceived: number;
  framesDecoded: number;
  framesDropped: number;
  /** Seconds, as the browser estimates it; `null` where the browser has no such number. */
  jitterSeconds: number | null;
  /** Seconds all frames together waited in the jitter buffer, and how many frames left it. */
  bufferDelaySeconds: number | null;
  bufferFrames: number | null;
  /** Freezes since the start, and the seconds they lasted together (Chromium only). */
  freezeCount: number | null;
  freezeSeconds: number | null;
  frameHeight: number | null;
  rttMs: number | null;
}

/**
 * The summary of one interval, in numbers a host can read at a glance. A field is `null` when the
 * browser does not report what it is made from. This is what travels in `receive-report`.
 */
export interface ReceiveReport {
  /** Share of packets lost, 0 to 1. */
  loss: number | null;
  /** Frames shown a second. */
  fps: number | null;
  /** Received video, kilobits a second. */
  kbps: number | null;
  jitterMs: number | null;
  /** How long a frame waits before it is shown, on average: the delay the viewer adds. */
  bufferMs: number | null;
  /** Freezes in this interval, and the milliseconds they lasted. */
  freezes: number | null;
  freezeMs: number | null;
  /** Picture height in pixels. */
  height: number | null;
  rttMs: number | null;
}

/** Picks the numbers out of the reports of a connection that receives one picture; else `null`. */
export function readReceiveStats(reports: Iterable<object>, at: number): ReceiveStats | null {
  let inbound: StatsEntry | undefined;
  let pair: StatsEntry | undefined;
  for (const item of reports) {
    const report = item as StatsEntry;
    if (report.type === 'inbound-rtp' && report.kind === 'video') inbound ??= report;
    else if (isSelectedPair(report)) pair ??= report;
  }
  if (!inbound) return null;

  const rtt = number(pair?.currentRoundTripTime);
  return {
    at,
    packetsReceived: number(inbound.packetsReceived) ?? 0,
    packetsLost: Math.max(0, number(inbound.packetsLost) ?? 0),
    bytesReceived: number(inbound.bytesReceived) ?? 0,
    framesDecoded: number(inbound.framesDecoded) ?? 0,
    framesDropped: number(inbound.framesDropped) ?? 0,
    jitterSeconds: number(inbound.jitter),
    bufferDelaySeconds: number(inbound.jitterBufferDelay),
    bufferFrames: number(inbound.jitterBufferEmittedCount),
    freezeCount: number(inbound.freezeCount),
    freezeSeconds: number(inbound.totalFreezesDuration),
    frameHeight: number(inbound.frameHeight),
    rttMs: rtt === null ? null : rtt * 1000,
  };
}

/** Under this many packets in an interval a loss share means nothing. */
const MIN_PACKETS = 20;

const round = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The change of a counter that some browsers do not report; `null` when either reading lacks it. */
const change = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null ? null : current - previous;

/**
 * The change from one reading to the next. `null` when the clock did not advance or a counter fell
 * (the picture was renegotiated and the counters began again), as the load monitor treats a reading.
 */
export function summarizeReceive(
  previous: ReceiveStats,
  current: ReceiveStats,
): ReceiveReport | null {
  const seconds = (current.at - previous.at) / 1000;
  if (seconds <= 0) return null;
  if (
    current.packetsReceived < previous.packetsReceived ||
    current.framesDecoded < previous.framesDecoded ||
    current.bytesReceived < previous.bytesReceived
  ) {
    return null;
  }

  const received = current.packetsReceived - previous.packetsReceived;
  const lost = Math.max(0, current.packetsLost - previous.packetsLost);
  const frames = change(current.bufferFrames, previous.bufferFrames);
  const delay = change(current.bufferDelaySeconds, previous.bufferDelaySeconds);
  const freezes = change(current.freezeCount, previous.freezeCount);
  const freezeSeconds = change(current.freezeSeconds, previous.freezeSeconds);

  return {
    loss: received + lost >= MIN_PACKETS ? round(lost / (received + lost), 3) : null,
    fps: round((current.framesDecoded - previous.framesDecoded) / seconds, 1),
    kbps: round(((current.bytesReceived - previous.bytesReceived) * 8) / seconds / 1000),
    jitterMs: current.jitterSeconds === null ? null : round(current.jitterSeconds * 1000),
    bufferMs:
      delay !== null && frames !== null && frames > 0 ? round((delay / frames) * 1000) : null,
    freezes: freezes === null || freezes < 0 ? null : freezes,
    freezeMs: freezeSeconds === null || freezeSeconds < 0 ? null : round(freezeSeconds * 1000),
    height: current.frameHeight,
    rttMs: current.rttMs === null ? null : round(current.rttMs),
  };
}
