import { describe, expect, it } from 'vitest';
import { summarizeCandidates } from '../peer/candidates';
import { ByteReader } from './bytes';
import { packSdp, unpackSdp } from './compact-sdp';

/** What a Chromium (Brave, Chrome) host offers; copied from a real run. */
const CHROMIUM = [
  'v=0',
  'o=- 782057406208229511 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1873582308 1 udp 2113937151 18e18c56-7375-4279-93e4-ad81de0dd890.local 59302 typ host generation 0 network-cost 999',
  'a=candidate:3931591122 1 udp 2113939711 491d33be-3eed-4428-87c4-10c1228805c7.local 44834 typ host generation 0 network-cost 999',
  'a=candidate:842163049 1 udp 1677729535 203.0.113.7 54400 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=ice-ufrag:70RJ',
  'a=ice-pwd:tV4Nxkq6vn6R34pogm0NMv50',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 D4:51:C9:A9:28:72:86:F8:EB:49:91:18:40:8A:64:87:61:72:A2:46:20:EC:71:E4:53:D5:90:DA:9A:C0:79:CC',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

/** What a Firefox host offers, with its active TCP candidates; copied from a real run. */
const FIREFOX = [
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-99.0 5117757710641888810 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  'a=sendrecv',
  'a=fingerprint:sha-256 16:CF:9D:7F:5A:9C:0B:61:AB:93:09:05:8B:34:9E:DE:DA:F0:29:A4:A6:17:CA:27:D0:00:B5:FA:A7:99:1D:A5',
  'a=group:BUNDLE 0',
  'a=ice-options:trickle',
  'a=msid-semantic:WMS *',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:0 1 UDP 2122187007 2cf53ee5-0513-4551-afe0-d9ee1294e38b.local 39759 typ host',
  'a=candidate:1 1 UDP 2122252543 a2e79de1-084c-4936-90b3-8dca7e2d443c.local 41094 typ host',
  'a=candidate:2 1 TCP 2105458943 2cf53ee5-0513-4551-afe0-d9ee1294e38b.local 9 typ host tcptype active',
  'a=candidate:3 1 TCP 2105524479 a2e79de1-084c-4936-90b3-8dca7e2d443c.local 9 typ host tcptype active',
  'a=sendrecv',
  'a=end-of-candidates',
  'a=ice-pwd:0275664544e7fd8b3a3f39dee9d274f3',
  'a=ice-ufrag:3710e5c5',
  'a=mid:0',
  'a=setup:actpass',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823',
  '',
].join('\r\n');

/** What the packed form must keep: everything that decides whether and how two browsers connect. */
function facts(sdp: string) {
  const lines = sdp.split(/\r?\n/);
  const pick = (prefix: string) => lines.find((line) => line.startsWith(prefix));
  return {
    fingerprint: pick('a=fingerprint:'),
    ufrag: pick('a=ice-ufrag:'),
    pwd: pick('a=ice-pwd:'),
    setup: pick('a=setup:'),
    candidates: lines
      .filter((line) => line.startsWith('a=candidate:'))
      .map((line) => /^a=candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\w+)/i.exec(line)!)
      .filter(([, protocol]) => protocol!.toLowerCase() === 'udp')
      .map(([, , address, port, type]) => `${type} ${address} ${port}`),
  };
}

function roundTrip(sdp: string): string {
  const packed = packSdp(sdp);
  expect(packed).not.toBeNull();
  const reader = new ByteReader(packed!);
  const restored = unpackSdp(reader);
  expect(reader.done).toBe(true);
  return restored;
}

/** A description of the usual shape with the parts the tests change swapped in. */
function sdpWith(changes: Record<string, string | null>): string {
  const lines = CHROMIUM.split('\r\n').flatMap((line) => {
    const key = Object.keys(changes).find((prefix) => line.startsWith(prefix));
    if (key === undefined) return [line];
    const replacement = changes[key];
    return replacement === null ? [] : [replacement];
  });
  return lines.join('\r\n');
}

describe('packSdp', () => {
  it('keeps what a Chromium description decides, in about a sixth of the bytes', () => {
    const restored = roundTrip(CHROMIUM);

    expect(facts(restored).fingerprint).toBe(facts(CHROMIUM).fingerprint);
    expect(facts(restored).ufrag).toBe('a=ice-ufrag:70RJ');
    expect(facts(restored).pwd).toBe('a=ice-pwd:tV4Nxkq6vn6R34pogm0NMv50');
    expect(facts(restored).setup).toBe('a=setup:actpass');
    expect(facts(restored).candidates).toEqual(facts(CHROMIUM).candidates);
    expect(summarizeCandidates(restored)).toEqual(summarizeCandidates(CHROMIUM));
    expect(packSdp(CHROMIUM)!.length).toBeLessThan(CHROMIUM.length / 5);
  });

  it('keeps what a Firefox description decides and leaves out its active TCP candidates', () => {
    const restored = roundTrip(FIREFOX);

    expect(facts(restored)).toEqual(facts(FIREFOX));
    expect(facts(restored).candidates).toHaveLength(2);
    expect(restored).not.toMatch(/tcp/i);
  });

  it('writes the description out again in a shape both browsers have taken from each other', () => {
    const restored = roundTrip(CHROMIUM).split('\r\n');

    expect(restored[0]).toBe('v=0');
    expect(restored).toContain('m=application 9 UDP/DTLS/SCTP webrtc-datachannel');
    expect(restored).toContain('a=mid:0');
    expect(restored).toContain('a=sctp-port:5000');
    expect(restored).toContain('a=end-of-candidates');
    // A reflexive address names no base (Chromium hides it too), and ends with a line break.
    expect(restored).toContain(
      `a=candidate:3 1 udp ${100 * 2 ** 24 + 65_533 * 256 + 255} 203.0.113.7 54400 typ srflx raddr 0.0.0.0 rport 0`,
    );
    expect(restored.at(-1)).toBe('');
  });

  it('keeps the order of the candidates and puts hosts before the rest in priority', () => {
    const lines = roundTrip(CHROMIUM).split('\r\n');
    const priorities = lines
      .filter((line) => line.startsWith('a=candidate:'))
      .map((line) => Number(line.split(' ')[3]));

    expect(priorities).toHaveLength(3);
    expect(priorities[0]).toBeGreaterThan(priorities[1]!);
    expect(priorities[1]).toBeGreaterThan(priorities[2]!);
  });

  it('keeps IPv4 and IPv6 addresses, written short or long', () => {
    const restored = roundTrip(
      sdpWith({
        'a=candidate:1873582308': 'a=candidate:1 1 udp 2113937151 192.168.1.20 40000 typ host',
        'a=candidate:3931591122':
          'a=candidate:2 1 udp 2113939711 2001:db8::1 40001 typ host generation 0',
        'a=candidate:842163049': 'a=candidate:3 1 udp 2113939711 fe80:0:0:0:1:2:3:4 40002 typ host',
      }),
    );

    expect(facts(restored).candidates).toEqual([
      'host 192.168.1.20 40000',
      'host 2001:db8:0:0:0:0:0:1 40001',
      'host fe80:0:0:0:1:2:3:4 40002',
    ]);
  });

  it('keeps a DTLS role of active and a port at the top of the range', () => {
    const restored = roundTrip(
      sdpWith({
        'a=setup:': 'a=setup:active',
        'a=candidate:1873582308': 'a=candidate:1 1 udp 2113937151 10.0.0.1 65535 typ host',
      }),
    );

    expect(facts(restored).setup).toBe('a=setup:active');
    expect(facts(restored).candidates[0]).toBe('host 10.0.0.1 65535');
  });

  it('keeps a description without any candidate', () => {
    const restored = roundTrip(
      sdpWith({
        'a=candidate:1873582308': null,
        'a=candidate:3931591122': null,
        'a=candidate:842163049': null,
      }),
    );

    expect(facts(restored).candidates).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5, 8, 22, 24, 32, 64])(
    'keeps an ICE password and user name of %i characters',
    (length) => {
      const ufrag = 'Zz09+/aB'.repeat(10).slice(0, length);
      const pwd = '/+9zZ0Aa'.repeat(10).slice(0, length);
      const restored = roundTrip(
        sdpWith({ 'a=ice-ufrag:': `a=ice-ufrag:${ufrag}`, 'a=ice-pwd:': `a=ice-pwd:${pwd}` }),
      );

      expect(facts(restored).ufrag).toBe(`a=ice-ufrag:${ufrag}`);
      expect(facts(restored).pwd).toBe(`a=ice-pwd:${pwd}`);
    },
  );

  it.each([
    ['a second section', `${CHROMIUM}m=video 9 UDP/TLS/RTP/SAVPF 96\r\n`],
    ['an attribute it does not know', sdpWith({ 'a=mid:0': 'a=mid:0\r\na=rtcp-mux' })],
    ['another mid', sdpWith({ 'a=mid:0': 'a=mid:data' })],
    ['another SCTP port', sdpWith({ 'a=sctp-port:': 'a=sctp-port:5001' })],
    ['no message size', sdpWith({ 'a=max-message-size:': null })],
    ['a small message size', sdpWith({ 'a=max-message-size:': 'a=max-message-size:1024' })],
    ['a fingerprint of another hash', sdpWith({ 'a=fingerprint:': 'a=fingerprint:sha-1 AA:BB' })],
    ['no fingerprint', sdpWith({ 'a=fingerprint:': null })],
    [
      'a candidate with a host name',
      sdpWith({ 'a=candidate:1873582308': 'a=candidate:1 1 udp 1 pc.example.org 9 typ host' }),
    ],
    [
      'a candidate for the second component',
      sdpWith({ 'a=candidate:1873582308': 'a=candidate:1 2 udp 1 10.0.0.1 9 typ host' }),
    ],
    [
      'a candidate with a port that does not exist',
      sdpWith({ 'a=candidate:1873582308': 'a=candidate:1 1 udp 1 10.0.0.1 70000 typ host' }),
    ],
    [
      'an IPv4 address with a part above 255',
      sdpWith({ 'a=candidate:1873582308': 'a=candidate:1 1 udp 1 10.0.0.256 9 typ host' }),
    ],
    [
      'an IPv6 address with an embedded IPv4',
      sdpWith({ 'a=candidate:1873582308': 'a=candidate:1 1 udp 1 ::ffff:10.0.0.1 9 typ host' }),
    ],
    ['an ICE user name with an odd character', sdpWith({ 'a=ice-ufrag:': 'a=ice-ufrag:ab-c' })],
    ['an empty ICE password', sdpWith({ 'a=ice-pwd:': 'a=ice-pwd:' })],
    ['an unknown DTLS role', sdpWith({ 'a=setup:': 'a=setup:holdconn' })],
    ['text that is no description', 'hello'],
  ])('does not pack %s, so the code carries the whole text', (_label, sdp) => {
    expect(packSdp(sdp)).toBeNull();
  });

  it('does not pack more candidates than it reads back', () => {
    const many = Array.from(
      { length: 17 },
      (_, i) => `a=candidate:${i} 1 udp 1 10.0.0.${i} 9000 typ host`,
    ).join('\r\n');

    expect(packSdp(sdpWith({ 'a=candidate:1873582308': many }))).toBeNull();
  });
});

describe('unpackSdp', () => {
  it('refuses every cut of a packed description', () => {
    const packed = packSdp(CHROMIUM)!;

    for (let length = 0; length < packed.length; length += 1) {
      expect(() => unpackSdp(new ByteReader(packed.slice(0, length)))).toThrow();
    }
  });

  it.each([
    ['an unknown DTLS role', 0, 9],
    ['more candidates than are allowed', 1 + 32 + 1 + 3 + 1 + 18, 200],
  ])('refuses %s', (_label, index, value) => {
    const packed = packSdp(CHROMIUM)!.slice();
    packed[index] = value;

    expect(() => unpackSdp(new ByteReader(packed))).toThrow(RangeError);
  });
});
