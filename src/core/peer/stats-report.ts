/** A report of `RTCPeerConnection.getStats()`, read loosely: browsers differ in what they fill in. */
export type StatsEntry = { type?: unknown; kind?: unknown; [field: string]: unknown };

/** The value when it is a real number, else `null`. */
export const statNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** The candidate pair the connection uses; browsers mark it in different ways. */
export function isSelectedPair(report: StatsEntry): boolean {
  return report.type === 'candidate-pair' && (report.nominated === true || !!report.selected);
}
