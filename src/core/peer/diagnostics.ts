import { hasPublicAddress, type CandidateSummary } from './candidates';

/** The state of one link, for an error message and for "copy technical details". No addresses. */
export interface LinkDiagnostics {
  connection: string;
  ice: string;
  gathering: string;
  signaling: string;
  /** What this side offered. */
  own: CandidateSummary;
  /** What the other side offered; all zero until its description was applied. */
  remote: CandidateSummary;
  /** How the connected path looks, e.g. `srflx/srflx` or `relay/host`; empty before it connected. */
  path: string;
}

const kinds = (summary: CandidateSummary) =>
  `local ${summary.local}, STUN ${summary.stun}, relay ${summary.relay}, IPv6 ${summary.globalIpv6}`;

/** One line a person can read out or paste into a bug report. */
export function describeDiagnostics(diagnostics: LinkDiagnostics): string {
  const lines = [
    `Connection: ${diagnostics.connection}, ICE: ${diagnostics.ice}, gathering: ${diagnostics.gathering}, signaling: ${diagnostics.signaling}`,
    `Your code offered: ${kinds(diagnostics.own)}${hasPublicAddress(diagnostics.own) ? '' : ' (no public address)'}`,
    `Their code offered: ${kinds(diagnostics.remote)}${hasPublicAddress(diagnostics.remote) ? '' : ' (no public address)'}`,
  ];
  if (diagnostics.path) lines.push(`Path: ${diagnostics.path}`);
  return lines.join('\n');
}
