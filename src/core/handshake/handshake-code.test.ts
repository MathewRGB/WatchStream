import { describe, expect, it } from 'vitest';
import { encodeBase64Url } from './base64url';
import { compress } from './compression';
import {
  decodeInvitation,
  decodeReply,
  encodeInvitation,
  encodeReply,
  HandshakeCodeError,
  type HandshakeCodeErrorReason,
} from './handshake-code';

const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:842163049 1 udp 1677729535 203.0.113.7 54400 typ srflx',
  'a=ice-ufrag:EsAw',
  'a=ice-pwd:bP+XJMM09aR8AiX1jdukzR6Y',
  'a=fingerprint:sha-256 D2:FA:0E:C3:22:59:5E:14:95:69:92:3D:13:B4:84:24:2C:C2:A2:C0:3E:FD:34:8E:5E:EA:6F:AF:52:CE:E6:0F',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  '',
].join('\r\n');

const INVITATION = { inviteId: 'abcDEF123_-x', hostName: 'user1', sdp: SDP };
const REPLY = { inviteId: 'abcDEF123_-x', viewerName: 'user2', sdp: SDP };

async function rawCode(prefix: string, payload: unknown): Promise<string> {
  return `${prefix}.${encodeBase64Url(await compress(JSON.stringify(payload)))}`;
}

async function expectReason(promise: Promise<unknown>, reason: HandshakeCodeErrorReason) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HandshakeCodeError);
  expect((error as HandshakeCodeError).reason).toBe(reason);
}

describe('handshake codes', () => {
  it('round-trips an invitation', async () => {
    const code = await encodeInvitation(INVITATION);
    expect(code).toMatch(/^WSI1\.[A-Za-z0-9_-]+$/);
    expect(await decodeInvitation(code)).toEqual({ kind: 'invitation', ...INVITATION });
  });

  it('round-trips a reply', async () => {
    const code = await encodeReply(REPLY);
    expect(code).toMatch(/^WSR1\.[A-Za-z0-9_-]+$/);
    expect(await decodeReply(code)).toEqual({ kind: 'reply', ...REPLY });
  });

  it('tolerates whitespace and line breaks added by messengers', async () => {
    const code = await encodeInvitation(INVITATION);
    const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20, 40)} \r\n${code.slice(40)}\n`;
    expect(await decodeInvitation(wrapped)).toEqual({ kind: 'invitation', ...INVITATION });
  });

  it('rejects an empty code', async () => {
    await expectReason(decodeInvitation('  \n '), 'empty');
  });

  it('rejects text that is not a WatchStream code', async () => {
    await expectReason(decodeInvitation('hello there'), 'malformed');
  });

  it('rejects a reply where an invitation is expected and vice versa', async () => {
    await expectReason(decodeInvitation(await encodeReply(REPLY)), 'wrong-kind');
    await expectReason(decodeReply(await encodeInvitation(INVITATION)), 'wrong-kind');
  });

  it('rejects an unknown format version', async () => {
    const code = (await encodeInvitation(INVITATION)).replace(/^WSI1/, 'WSI2');
    await expectReason(decodeInvitation(code), 'unsupported-version');
  });

  it('rejects a truncated code', async () => {
    const code = await encodeInvitation(INVITATION);
    await expectReason(decodeInvitation(code.slice(0, code.length - 15)), 'malformed');
  });

  it.each([
    ['a payload of the wrong kind', { ...INVITATION, kind: 'reply' }],
    ['an invalid invite id', { ...INVITATION, kind: 'invitation', inviteId: 'short' }],
    ['a missing name', { ...INVITATION, kind: 'invitation', hostName: ' ' }],
    ['a too long name', { ...INVITATION, kind: 'invitation', hostName: 'x'.repeat(41) }],
    ['a payload without SDP', { ...INVITATION, kind: 'invitation', sdp: 'nope' }],
    ['a payload that is not an object', ['WSI1']],
  ])('rejects %s', async (_label, payload) => {
    await expectReason(decodeInvitation(await rawCode('WSI1', payload)), 'malformed');
  });
});
