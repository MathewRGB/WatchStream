import { describe, expect, it } from 'vitest';
import { hasPublicAddress, summarizeCandidates } from './candidates';

const line = (address: string, type: string) =>
  `a=candidate:1 1 udp 2113937151 ${address} 54321 typ ${type} generation 0`;
const sdp = (...candidates: string[]) => ['v=0', 'm=application 9', ...candidates, ''].join('\r\n');

describe('summarizeCandidates', () => {
  it('counts each kind of candidate', () => {
    const summary = summarizeCandidates(
      sdp(
        line('192.168.1.5', 'host'),
        line('203.0.113.7', 'srflx'),
        line('198.51.100.2', 'relay'),
        line('2001:db8::1', 'host'),
      ),
    );

    expect(summary).toEqual({ local: 2, stun: 1, relay: 1, globalIpv6: 1 });
  });

  it('does not count private or link-local IPv6 addresses and .local names as public', () => {
    const summary = summarizeCandidates(
      sdp(
        line('fe80::1', 'host'),
        line('fd12:3456::1', 'host'),
        line('0f3a5b7c-1111-2222-3333-444455556666.local', 'host'),
        line('192.168.1.5', 'host'),
      ),
    );

    expect(summary).toEqual({ local: 4, stun: 0, relay: 0, globalIpv6: 0 });
    expect(hasPublicAddress(summary)).toBe(false);
  });

  it('knows an empty description has no candidates', () => {
    expect(summarizeCandidates('v=0\r\n')).toEqual({ local: 0, stun: 0, relay: 0, globalIpv6: 0 });
  });

  it.each([
    ['a STUN address', sdp(line('203.0.113.7', 'srflx'))],
    ['a relay address', sdp(line('198.51.100.2', 'relay'))],
    ['a global IPv6 address', sdp(line('2001:db8::1', 'host'))],
  ])('reports a public address for %s', (_, description) => {
    expect(hasPublicAddress(summarizeCandidates(description))).toBe(true);
  });
});
