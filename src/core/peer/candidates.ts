/**
 * What kinds of network addresses a session description offers. A peer on
 * another network can only reach a "public" one: a server-reflexive address
 * found through STUN, a relay address, or a global IPv6 address. Local
 * addresses (or obfuscated `.local` names) only work inside one network.
 */
export interface CandidateSummary {
  /** Addresses of this machine on its own network. */
  local: number;
  /** Public addresses found through STUN. */
  stun: number;
  /** Addresses of a relay (TURN). */
  relay: number;
  /** Local candidates that are global IPv6 addresses, reachable without NAT. */
  globalIpv6: number;
}

const CANDIDATE = /^a=candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ (\w+)/;

export function summarizeCandidates(sdp: string): CandidateSummary {
  const summary: CandidateSummary = { local: 0, stun: 0, relay: 0, globalIpv6: 0 };
  for (const line of sdp.split(/\r?\n/)) {
    const match = CANDIDATE.exec(line);
    if (!match) continue;
    const [, address, type] = match as unknown as [string, string, string];
    if (type === 'srflx') summary.stun += 1;
    else if (type === 'relay') summary.relay += 1;
    else if (type === 'host') {
      summary.local += 1;
      if (isGlobalIpv6(address)) summary.globalIpv6 += 1;
    }
  }
  return summary;
}

/** Someone on another network has a chance to reach this description. */
export function hasPublicAddress(summary: CandidateSummary): boolean {
  return summary.stun > 0 || summary.relay > 0 || summary.globalIpv6 > 0;
}

function isGlobalIpv6(address: string): boolean {
  return address.includes(':') && !/^(fe80|fc|fd|::1)/i.test(address);
}
