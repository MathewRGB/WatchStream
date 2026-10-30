/**
 * The session description of a handshake code, in as few bytes as it takes.
 *
 * Only a data channel is negotiated with the codes (pictures and sound follow over the open
 * channel), so a description holds little that a person's two browsers do not already agree on:
 * the fingerprint of the certificate, the ICE user name and password, the DTLS role and the
 * addresses. Everything else is written out again when the code is read. A description that holds
 * anything else (another kind of section, an attribute that is not known) is not packed at all:
 * `packSdp` answers `null`, and the code carries the whole text instead.
 */

import { ByteReader, ByteWriter } from './bytes';

/** What `a=candidate` lines say, in the order of the 2 low bits of a candidate's first byte. */
const TYPES = ['host', 'srflx', 'prflx', 'relay'] as const;
type CandidateType = (typeof TYPES)[number];
/** RFC 8445 type preferences, which `priority` is made of. */
const TYPE_PREFERENCE: Record<CandidateType, number> = {
  host: 126,
  srflx: 100,
  prflx: 110,
  relay: 0,
};

const SETUPS = ['actpass', 'active', 'passive'] as const;
const KIND_V4 = 0;
const KIND_V6 = 1;
const KIND_MDNS = 2;

const MAX_CANDIDATES = 16;
const MAX_ICE_LENGTH = 64;
/** The data channel's SCTP port, and the largest message we say we take (all browsers allow it). */
const SCTP_PORT = '5000';
const MAX_MESSAGE_SIZE = 262_144;
/** A peer that allows less than this is not packed: the figure written back would be wrong. */
const MIN_MESSAGE_SIZE = 65_536;

/** The characters ICE user names and passwords are made of, 6 bits each. */
const ICE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Lines that say nothing the packed form does not say again, or nothing at all. */
const IGNORED_LINE =
  /^(?:v=0|o=.*|s=.*|t=0 0|c=IN IP[46] \S+|a=group:BUNDLE 0|a=extmap-allow-mixed|a=msid-semantic:.*|a=ice-options:trickle|a=sendrecv|a=end-of-candidates)$/;
const MEDIA_LINE = /^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/;
const CANDIDATE_LINE =
  /^a=candidate:\S+ (\d+) (\S+) \d+ (\S+) (\d+) typ (host|srflx|prflx|relay)(?: .*)?$/;
const FINGERPRINT_LINE = /^a=fingerprint:sha-256 ((?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2})$/;
const MDNS_NAME = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/;

interface Candidate {
  type: number;
  kind: number;
  address: Uint8Array;
  port: number;
}

/** The packed form of `sdp`, or `null` when it is not of the one shape this form can hold. */
export function packSdp(sdp: string): Uint8Array | null {
  let fingerprint: Uint8Array | null = null;
  let ufrag: string | null = null;
  let pwd: string | null = null;
  let setup = -1;
  let mediaLines = 0;
  let mid = false;
  let sctpPort = false;
  let maxMessageSize = 0;
  const candidates: Candidate[] = [];

  for (const line of sdp.split(/\r?\n/)) {
    if (line === '' || IGNORED_LINE.test(line)) continue;
    let match: RegExpExecArray | null;
    if (MEDIA_LINE.test(line)) {
      mediaLines += 1;
    } else if ((match = FINGERPRINT_LINE.exec(line))) {
      fingerprint = Uint8Array.from(match[1]!.split(':'), (hex) => Number.parseInt(hex, 16));
    } else if (line.startsWith('a=ice-ufrag:')) {
      ufrag = line.slice('a=ice-ufrag:'.length);
    } else if (line.startsWith('a=ice-pwd:')) {
      pwd = line.slice('a=ice-pwd:'.length);
    } else if (line.startsWith('a=setup:')) {
      setup = SETUPS.indexOf(line.slice('a=setup:'.length) as (typeof SETUPS)[number]);
    } else if (line === 'a=mid:0') {
      mid = true;
    } else if (line === `a=sctp-port:${SCTP_PORT}`) {
      sctpPort = true;
    } else if ((match = /^a=max-message-size:(\d+)$/.exec(line))) {
      maxMessageSize = Number(match[1]);
    } else if ((match = CANDIDATE_LINE.exec(line))) {
      const [, component, protocol, address, port, type] = match as unknown as string[];
      if (component !== '1') return null;
      const lower = protocol!.toLowerCase();
      // Active TCP candidates (Firefox) have no port to reach and no passive peer to meet: no
      // browser gathers the other half, so they never form a pair.
      if (lower === 'tcp') continue;
      if (lower !== 'udp') return null;
      const packed = packAddress(address!);
      const portNumber = Number(port);
      if (!packed || portNumber > 65_535) return null;
      candidates.push({
        type: TYPES.indexOf(type as CandidateType),
        kind: packed.kind,
        address: packed.bytes,
        port: portNumber,
      });
    } else {
      return null;
    }
  }

  if (mediaLines !== 1 || !mid || !sctpPort || !fingerprint || setup < 0) return null;
  if (maxMessageSize < MIN_MESSAGE_SIZE || candidates.length > MAX_CANDIDATES) return null;
  if (!isIce(ufrag) || !isIce(pwd)) return null;

  const out = new ByteWriter();
  out.u8(setup);
  out.bytes(fingerprint);
  writeIce(out, ufrag);
  writeIce(out, pwd);
  out.u8(candidates.length);
  for (const candidate of candidates) {
    out.u8(candidate.type | (candidate.kind << 2));
    out.bytes(candidate.address);
    out.u16(candidate.port);
  }
  return out.finish();
}

/** The description that `packSdp` packed. Throws a `RangeError` when `reader` runs out. */
export function unpackSdp(reader: ByteReader): string {
  const setup = SETUPS[reader.u8()];
  if (!setup) throw new RangeError('Unknown DTLS role');
  const fingerprint = Array.from(reader.take(32), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(':');
  const ufrag = readIce(reader);
  const pwd = readIce(reader);
  const count = reader.u8();
  if (count > MAX_CANDIDATES) throw new RangeError('Too many candidates');

  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const first = reader.u8();
    const type = TYPES[first & 3]!;
    const kind = first >> 2;
    const address = readAddress(reader, kind);
    const port = reader.u16();
    // Priorities only order the checks: host before the rest, in the order the code lists them.
    const priority = TYPE_PREFERENCE[type] * 2 ** 24 + (65_535 - index) * 256 + 255;
    const related = type === 'host' ? '' : ` raddr ${kind === KIND_V6 ? '::' : '0.0.0.0'} rport 0`;
    lines.push(
      `a=candidate:${index + 1} 1 udp ${priority} ${address} ${port} typ ${type}${related}`,
    );
  }

  return [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'a=group:BUNDLE 0',
    'a=extmap-allow-mixed',
    'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    ...lines,
    'a=end-of-candidates',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    'a=ice-options:trickle',
    `a=fingerprint:sha-256 ${fingerprint}`,
    `a=setup:${setup}`,
    'a=mid:0',
    `a=sctp-port:${SCTP_PORT}`,
    `a=max-message-size:${MAX_MESSAGE_SIZE}`,
    '',
  ].join('\r\n');
}

function isIce(text: string | null): text is string {
  return (
    text !== null &&
    text.length >= 1 &&
    text.length <= MAX_ICE_LENGTH &&
    [...text].every((char) => ICE_CHARS.includes(char))
  );
}

/** Length, then 6 bits for each character. */
function writeIce(out: ByteWriter, text: string): void {
  out.u8(text.length);
  let bits = 0;
  let count = 0;
  for (const char of text) {
    // Only the bits not written yet matter; masking keeps them far inside 32 bits.
    bits = ((bits << 6) | ICE_CHARS.indexOf(char)) & 0xffff;
    count += 6;
    if (count >= 8) {
      count -= 8;
      out.u8((bits >> count) & 0xff);
    }
  }
  if (count > 0) out.u8((bits << (8 - count)) & 0xff);
}

function readIce(reader: ByteReader): string {
  const length = reader.u8();
  if (length < 1 || length > MAX_ICE_LENGTH) throw new RangeError('Bad ICE string');
  const packed = reader.take(Math.ceil((length * 6) / 8));
  let text = '';
  let bits = 0;
  let count = 0;
  for (const byte of packed) {
    bits = ((bits << 8) | byte) & 0xffff;
    count += 8;
    while (count >= 6 && text.length < length) {
      count -= 6;
      text += ICE_CHARS[(bits >> count) & 63];
    }
  }
  return text;
}

function packAddress(text: string): { kind: number; bytes: Uint8Array } | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const bytes = Uint8Array.from(v4.slice(1), Number);
    return bytes.every((byte, i) => byte === Number(v4[i + 1]) && byte <= 255)
      ? { kind: KIND_V4, bytes }
      : null;
  }
  const mdns = MDNS_NAME.exec(text);
  if (mdns) return { kind: KIND_MDNS, bytes: hexToBytes(mdns.slice(1).join('')) };
  const v6 = parseIpv6(text);
  return v6 ? { kind: KIND_V6, bytes: v6 } : null;
}

function readAddress(reader: ByteReader, kind: number): string {
  if (kind === KIND_V4) return Array.from(reader.take(4)).join('.');
  if (kind === KIND_V6) {
    const bytes = reader.take(16);
    return Array.from({ length: 8 }, (_, i) =>
      ((bytes[2 * i]! << 8) | bytes[2 * i + 1]!).toString(16),
    ).join(':');
  }
  if (kind === KIND_MDNS) {
    const hex = Array.from(reader.take(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
  }
  throw new RangeError('Unknown address kind');
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from({ length: hex.length / 2 }, (_, i) =>
    Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16),
  );
}

/** Sixteen bytes, or `null` for anything but plain hexadecimal groups (no zone, no embedded IPv4). */
function parseIpv6(text: string): Uint8Array | null {
  if (!/^[0-9a-fA-F:]+$/.test(text)) return null;
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill('0'), ...tail];
  if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) return null;
  return Uint8Array.from(
    groups.flatMap((group) => {
      const value = Number.parseInt(group, 16);
      return [value >> 8, value & 0xff];
    }),
  );
}
