import { decodeBase64Url, encodeBase64Url } from './base64url';
import { isSessionDescription } from '../peer/session-description';
import { compress, decompress } from './compression';
import { ByteReader, ByteWriter } from './bytes';
import { packSdp, unpackSdp } from './compact-sdp';

/**
 * Invitation and reply codes carry a WebRTC session description between two
 * peers through a channel the users provide themselves (e.g. a messenger).
 *
 * Format: `<prefix>.<base64url(body)>`, where the prefix names the kind of code and the format
 * version. The first byte of the body says how the rest is written:
 *
 * - `COMPACT`: the invite id (6 bytes), the name and the packed session description. The usual
 *   case, a few hundred characters shorter than the other.
 * - `FULL`: `deflate-raw` of a JSON object with the whole session description. For a description
 *   the packed form cannot hold (see `compact-sdp.ts`) and for an id that is not six bytes long.
 */

export interface Invitation {
  kind: 'invitation';
  inviteId: string;
  hostName: string;
  sdp: string;
}

export interface Reply {
  kind: 'reply';
  inviteId: string;
  viewerName: string;
  sdp: string;
}

export type HandshakeCodeErrorReason = 'empty' | 'wrong-kind' | 'unsupported-version' | 'malformed';

export class HandshakeCodeError extends Error {
  constructor(
    readonly reason: HandshakeCodeErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'HandshakeCodeError';
  }
}

export const MAX_NAME_LENGTH = 40;
const MAX_DECOMPRESSED_BYTES = 32_000;
const INVITE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
/** The invite ids the compact form holds: six bytes, as eight base64url characters. */
const SHORT_INVITE_ID_PATTERN = /^[A-Za-z0-9_-]{8}$/;
const FORMAT_VERSION = 2;

const COMPACT = 0;
const FULL = 1;

const PREFIX = { invitation: 'WSI', reply: 'WSR' } as const;
const NAME_FIELD = { invitation: 'hostName', reply: 'viewerName' } as const;

/** A fresh id for an invitation: short, because it is part of every code. */
export function newInviteId(): string {
  return encodeBase64Url(crypto.getRandomValues(new Uint8Array(6)));
}

export function encodeInvitation(invitation: Omit<Invitation, 'kind'>): Promise<string> {
  const { inviteId, hostName, sdp } = invitation;
  return encode('invitation', inviteId, hostName, sdp);
}

export function encodeReply(reply: Omit<Reply, 'kind'>): Promise<string> {
  const { inviteId, viewerName, sdp } = reply;
  return encode('reply', inviteId, viewerName, sdp);
}

export async function decodeInvitation(code: string): Promise<Invitation> {
  const { inviteId, name, sdp } = await decode('invitation', code);
  return { kind: 'invitation', inviteId, hostName: name, sdp };
}

export async function decodeReply(code: string): Promise<Reply> {
  const { inviteId, name, sdp } = await decode('reply', code);
  return { kind: 'reply', inviteId, viewerName: name, sdp };
}

async function encode(
  kind: keyof typeof PREFIX,
  inviteId: string,
  name: string,
  sdp: string,
): Promise<string> {
  const body = encodeCompact(inviteId, name, sdp) ?? (await encodeFull(kind, inviteId, name, sdp));
  return `${PREFIX[kind]}${FORMAT_VERSION}.${encodeBase64Url(body)}`;
}

/** `null` when the id, the name or the description does not fit the compact form. */
function encodeCompact(inviteId: string, name: string, sdp: string): Uint8Array | null {
  const packed = packSdp(sdp);
  const nameBytes = new TextEncoder().encode(name);
  if (!packed || !SHORT_INVITE_ID_PATTERN.test(inviteId) || nameBytes.length > 255) return null;
  const out = new ByteWriter();
  out.u8(COMPACT);
  out.bytes(decodeBase64Url(inviteId));
  out.prefixed(nameBytes);
  out.bytes(packed);
  return out.finish();
}

async function encodeFull(
  kind: keyof typeof PREFIX,
  inviteId: string,
  name: string,
  sdp: string,
): Promise<Uint8Array> {
  const json = JSON.stringify({ kind, inviteId, [NAME_FIELD[kind]]: name, sdp });
  const out = new ByteWriter();
  out.u8(FULL);
  out.bytes(await compress(json));
  return out.finish();
}

interface Decoded {
  inviteId: string;
  name: string;
  sdp: string;
}

async function decode(kind: keyof typeof PREFIX, code: string): Promise<Decoded> {
  const compact = code.replace(/\s+/g, '');
  if (compact === '') {
    throw new HandshakeCodeError('empty', 'The code is empty.');
  }

  const match = /^(WS[IR])(\d+)\.(.+)$/.exec(compact);
  if (!match) {
    throw new HandshakeCodeError('malformed', 'This is not a WatchStream code.');
  }
  const [, prefix, version, body] = match as unknown as [string, string, string, string];
  if (prefix !== PREFIX[kind]) {
    const expected = kind === 'invitation' ? 'an invitation' : 'a reply';
    throw new HandshakeCodeError('wrong-kind', `Expected ${expected} code.`);
  }
  if (Number(version) !== FORMAT_VERSION) {
    throw new HandshakeCodeError(
      'unsupported-version',
      'This code was created by an incompatible WatchStream version.',
    );
  }

  let decoded: Decoded;
  try {
    const bytes = decodeBase64Url(body);
    decoded = bytes[0] === COMPACT ? decodeCompact(bytes) : await decodeFull(kind, bytes);
  } catch {
    throw new HandshakeCodeError('malformed', 'The code is damaged or incomplete.');
  }
  if (
    !INVITE_ID_PATTERN.test(decoded.inviteId) ||
    !isSessionDescription(decoded.sdp) ||
    decoded.name.trim() === '' ||
    decoded.name.length > MAX_NAME_LENGTH
  ) {
    throw new HandshakeCodeError('malformed', 'The code is damaged.');
  }
  return decoded;
}

function decodeCompact(bytes: Uint8Array): Decoded {
  const reader = new ByteReader(bytes);
  reader.u8();
  const inviteId = encodeBase64Url(reader.take(6));
  const name = new TextDecoder('utf-8', { fatal: true }).decode(reader.prefixed());
  const sdp = unpackSdp(reader);
  if (!reader.done) throw new RangeError('Trailing data');
  return { inviteId, name, sdp };
}

async function decodeFull(kind: keyof typeof PREFIX, bytes: Uint8Array): Promise<Decoded> {
  if (bytes[0] !== FULL) throw new TypeError('Unknown body');
  const json = await decompress(bytes.subarray(1), MAX_DECOMPRESSED_BYTES);
  const data: unknown = JSON.parse(json);
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new TypeError('Payload is not an object');
  }
  const fields = data as Record<string, unknown>;
  const { inviteId, sdp } = fields;
  const name = fields[NAME_FIELD[kind]];
  if (fields.kind !== kind || typeof inviteId !== 'string' || typeof sdp !== 'string') {
    throw new TypeError('Missing fields');
  }
  if (typeof name !== 'string') throw new TypeError('Missing name');
  return { inviteId, name, sdp };
}
