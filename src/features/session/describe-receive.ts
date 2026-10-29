import type { ReceiveReport } from '@/core/peer/receive-stats';

export interface ReceiveLine {
  /** What the viewer sees arrive, in a short line. */
  text: string;
  /** A likely reason when the picture does not arrive well; `null` while it does. */
  problem: string | null;
}

/** From this share of lost packets on, the connection cannot carry the picture as sent. */
const LOSS_BAD = 0.03;
const BUFFER_BAD_MS = 400;
const RTT_HIGH_MS = 250;

const present = (value: number | null): value is number => value !== null;

/**
 * One line for the host about what reaches one viewer, and a guess at why when it is not good.
 * The numbers are the viewer's own; the guess is the first rule that fits, from the cause that
 * is cheapest for the host to act on to the one it cannot change.
 */
export function describeReceive(report: ReceiveReport): ReceiveLine {
  const parts: string[] = [];
  if (present(report.height)) parts.push(`${report.height}p`);
  if (present(report.fps)) parts.push(`${Math.round(report.fps)} fps`);
  if (present(report.kbps)) parts.push(`${(report.kbps / 1000).toFixed(1)} Mbit/s`);
  if (present(report.loss)) parts.push(`${(report.loss * 100).toFixed(1)} % lost`);
  if (present(report.bufferMs)) parts.push(`${report.bufferMs} ms wait`);
  if (present(report.rttMs)) parts.push(`${report.rttMs} ms round trip`);
  if (present(report.freezes) && report.freezes > 0) {
    parts.push(`${report.freezes} ${report.freezes === 1 ? 'freeze' : 'freezes'}`);
  }
  return { text: parts.join(' · '), problem: guessProblem(report) };
}

function guessProblem(report: ReceiveReport): string | null {
  const { loss, bufferMs, freezes, rttMs } = report;
  if (present(loss) && loss >= LOSS_BAD) {
    return 'Packets are lost on the way: the connection between you cannot carry this much. A lower quality helps.';
  }
  if (present(bufferMs) && bufferMs >= BUFFER_BAD_MS) {
    return present(rttMs) && rttMs >= RTT_HIGH_MS
      ? 'The picture waits long because the way between you is long and uneven.'
      : 'The picture waits long before it is shown: uneven delivery or a slow computer on the viewer side.';
  }
  if (present(freezes) && freezes > 0) {
    return 'The picture froze: not enough data arrived in time.';
  }
  return null;
}
