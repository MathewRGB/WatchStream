import { describe, expect, it } from 'vitest';
import { describeDiagnostics, type LinkDiagnostics } from './diagnostics';

const none = { local: 0, stun: 0, relay: 0, globalIpv6: 0 };
const base: LinkDiagnostics = {
  connection: 'failed',
  ice: 'failed',
  gathering: 'complete',
  signaling: 'stable',
  own: { local: 1, stun: 1, relay: 0, globalIpv6: 0 },
  remote: { local: 1, stun: 0, relay: 0, globalIpv6: 0 },
  path: '',
};

describe('describeDiagnostics', () => {
  it('states the connection state and what each side offered', () => {
    const text = describeDiagnostics(base);

    expect(text).toContain('Connection: failed, ICE: failed, gathering: complete');
    expect(text).toContain('Your code offered: local 1, STUN 1, relay 0, IPv6 0\n');
  });

  it('points out a side without a public address', () => {
    const text = describeDiagnostics(base);

    expect(text).toContain(
      'Their code offered: local 1, STUN 0, relay 0, IPv6 0 (no public address)',
    );
    expect(text).not.toContain('Your code offered: local 1, STUN 1, relay 0, IPv6 0 (no');
  });

  it('adds the path only once it exists', () => {
    expect(describeDiagnostics({ ...base, remote: none })).not.toContain('Path:');
    expect(describeDiagnostics({ ...base, path: 'srflx/srflx' })).toContain('Path: srflx/srflx');
  });
});
