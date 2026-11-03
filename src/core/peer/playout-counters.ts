import type { BufferCounter, PlayoutCounters } from '../media/delay-tracker';
import { statNumber as number, type StatsEntry } from './stats-report';

/** The jitter-buffer counters of one received track, or `null` where the browser has none. */
function counterOf(report: StatsEntry | undefined): BufferCounter | null {
  const delaySeconds = number(report?.jitterBufferDelay);
  const emitted = number(report?.jitterBufferEmittedCount);
  return delaySeconds === null || emitted === null ? null : { delaySeconds, emitted };
}

/**
 * Picks how long the picture and the sound wait in their jitter buffers out of the reports of a
 * connection that receives. `null` while nothing is received.
 */
export function readPlayoutCounters(reports: Iterable<object>): PlayoutCounters | null {
  let video: StatsEntry | undefined;
  let audio: StatsEntry | undefined;
  for (const item of reports) {
    const report = item as StatsEntry;
    if (report.type !== 'inbound-rtp') continue;
    if (report.kind === 'video') video ??= report;
    else if (report.kind === 'audio') audio ??= report;
  }
  if (!video && !audio) return null;
  return { video: counterOf(video), audio: counterOf(audio) };
}
