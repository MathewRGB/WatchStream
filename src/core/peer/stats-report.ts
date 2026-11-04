/** A report of `RTCPeerConnection.getStats()`, read loosely: browsers differ in what they fill in. */
export type StatsEntry = { type?: unknown; kind?: unknown; [field: string]: unknown };

/** The value when it is a real number, else `null`. */
export const statNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The kinds of the candidates of the connected pair as `local/remote`, e.g. `srflx/srflx` (direct
 * through STUN) or `relay/srflx`; `null` while nothing is connected or the kinds cannot be told.
 * Chromium names the pair in its `transport` report, Firefox only marks it nominated.
 */
export function connectedPath(reports: Iterable<StatsEntry>): string | null {
  const kinds = new Map<string, string>();
  const pairs = new Map<string, StatsEntry>();
  let named: string | undefined;
  let marked: StatsEntry | undefined;
  for (const report of reports) {
    if (
      (report.type === 'local-candidate' || report.type === 'remote-candidate') &&
      typeof report.id === 'string' &&
      typeof report.candidateType === 'string'
    ) {
      kinds.set(report.id, report.candidateType);
    } else if (report.type === 'candidate-pair') {
      if (typeof report.id === 'string') pairs.set(report.id, report);
      if (isSelectedPair(report)) marked ??= report;
    } else if (report.type === 'transport' && typeof report.selectedCandidatePairId === 'string') {
      named = report.selectedCandidatePairId;
    }
  }
  const pair = (named === undefined ? undefined : pairs.get(named)) ?? marked;
  const local = typeof pair?.localCandidateId === 'string' ? kinds.get(pair.localCandidateId) : '';
  const remote =
    typeof pair?.remoteCandidateId === 'string' ? kinds.get(pair.remoteCandidateId) : '';
  return local && remote ? `${local}/${remote}` : null;
}

/** The candidate pair the connection uses; browsers mark it in different ways. */
export function isSelectedPair(report: StatsEntry): boolean {
  return report.type === 'candidate-pair' && (report.nominated === true || !!report.selected);
}
