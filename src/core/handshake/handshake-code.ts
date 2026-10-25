import { decodeBase64Url, encodeBase64Url } from './base64url';
import { compress, decompress } from './compression';

/**
 * Invitation and reply codes carry a WebRTC session description between two
 * peers through a channel the users provide themselves (e.g. a messenger).
 *
 * Format: `<prefix>.<base64url(deflate-raw(JSON))>`, where the prefix names
 * the kind of code and the format version.
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
const MAX_SDP_LENGTH = 20_000;
const MAX_DECOMPRESSED_BYTES = 32_000;
const INVITE_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const FORMAT_VERSION = 1;

const PREFIX = { invitation: 'WSI', reply: 'WSR' } as const;

export function encodeInvitation(invitation: Omit<Invitation, 'kind'>): Promise<string> {
  return encode('invitation', { ...invitation, kind: 'invitation' });
}

export function encodeReply(reply: Omit<Reply, 'kind'>): Promise<string> {
  return encode('reply', { ...reply, kind: 'reply' });
}

export async function decodeInvitation(code: string): Promise<Invitation> {
  const data = await decode('invitation', code);
  return {
    kind: 'invitation',
    inviteId: data.inviteId,
    hostName: readName(data, 'hostName'),
    sdp: data.sdp,
  };
}

export async function decodeReply(code: string): Promise<Reply> {
  const data = await decode('reply', code);
  return {
    kind: 'reply',
    inviteId: data.inviteId,
    viewerName: readName(data, 'viewerName'),
    sdp: data.sdp,
  };
}

async function encode(kind: keyof typeof PREFIX, payload: Invitation | Reply): Promise<string> {
  const bytes = await compress(JSON.stringify(payload));
  return `${PREFIX[kind]}${FORMAT_VERSION}.${encodeBase64Url(bytes)}`;
}

interface CommonFields extends Record<string, unknown> {
  inviteId: string;
  sdp: string;
}

async function decode(kind: keyof typeof PREFIX, code: string): Promise<CommonFields> {
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

  const data = await parseBody(body);
  if (data.kind !== kind || !isCommonFields(data)) {
    throw new HandshakeCodeError('malformed', 'The code is damaged.');
  }
  return data;
}

async function parseBody(body: string): Promise<Record<string, unknown>> {
  try {
    const json = await decompress(decodeBase64Url(body), MAX_DECOMPRESSED_BYTES);
    const data: unknown = JSON.parse(json);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new TypeError('Payload is not an object');
    }
    return data as Record<string, unknown>;
  } catch {
    throw new HandshakeCodeError('malformed', 'The code is damaged or incomplete.');
  }
}

function isCommonFields(data: Record<string, unknown>): data is CommonFields {
  return (
    typeof data.inviteId === 'string' &&
    INVITE_ID_PATTERN.test(data.inviteId) &&
    typeof data.sdp === 'string' &&
    data.sdp.startsWith('v=0') &&
    data.sdp.length <= MAX_SDP_LENGTH
  );
}

function readName(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_NAME_LENGTH) {
    throw new HandshakeCodeError('malformed', 'The code is damaged.');
  }
  return value;
}
