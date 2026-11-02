import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './base64url';
import { compress } from './compression';
import {
  decodeInvitation,
  decodeReply,
  encodeInvitation,
  encodeReply,
  HandshakeCodeError,
  newInviteId,
  type HandshakeCodeErrorReason,
} from './handshake-code';

/** A description of the shape the browsers produce: the code holds it in packed form. */
const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:842163049 1 udp 1677729535 203.0.113.7 54400 typ srflx raddr 0.0.0.0 rport 0',
  'a=ice-ufrag:EsAw',
  'a=ice-pwd:bP+XJMM09aR8AiX1jdukzR6Y',
  'a=ice-options:trickle',
  'a=fingerprint:sha-256 D2:FA:0E:C3:22:59:5E:14:95:69:92:3D:13:B4:84:24:2C:C2:A2:C0:3E:FD:34:8E:5E:EA:6F:AF:52:CE:E6:0F',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  '',
].join('\r\n');

/** Not a description of that shape (the test network's): the code holds the whole text. */
const ODD_SDP = 'v=0\r\nfake-offer-0\r\n';

const INVITATION = { inviteId: 'abcDEF12', hostName: 'user1', sdp: SDP };
const REPLY = { inviteId: 'abcDEF12', viewerName: 'user2', sdp: SDP };

/** What a code of the full kind carries; written by hand so that the tests can damage it. */
async function fullCode(prefix: string, payload: unknown): Promise<string> {
  const body = new Uint8Array([1, ...(await compress(JSON.stringify(payload)))]);
  return `${prefix}.${encodeBase64Url(body)}`;
}

function bodyOf(code: string): Uint8Array {
  return decodeBase64Url(code.slice(code.indexOf('.') + 1));
}

function withBody(code: string, body: Uint8Array): string {
  return `${code.slice(0, code.indexOf('.') + 1)}${encodeBase64Url(body)}`;
}

async function expectReason(promise: Promise<unknown>, reason: HandshakeCodeErrorReason) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(HandshakeCodeError);
  expect((error as HandshakeCodeError).reason).toBe(reason);
}

/** What a decoded description must still say; the text itself is written out again. */
function essentials(sdp: string) {
  return {
    fingerprint: /a=fingerprint:.*/.exec(sdp)?.[0],
    pwd: /a=ice-pwd:.*/.exec(sdp)?.[0],
    candidate: /typ srflx/.test(sdp) && /203\.0\.113\.7 54400/.test(sdp),
  };
}

describe('handshake codes', () => {
  it('round-trips an invitation', async () => {
    const code = await encodeInvitation(INVITATION);
    expect(code).toMatch(/^WSI2\.[A-Za-z0-9_-]+$/);

    const decoded = await decodeInvitation(code);

    expect(decoded).toMatchObject({ kind: 'invitation', inviteId: 'abcDEF12', hostName: 'user1' });
    expect(essentials(decoded.sdp)).toEqual(essentials(SDP));
  });

  it('round-trips a reply', async () => {
    const code = await encodeReply(REPLY);
    expect(code).toMatch(/^WSR2\.[A-Za-z0-9_-]+$/);

    const decoded = await decodeReply(code);

    expect(decoded).toMatchObject({ kind: 'reply', inviteId: 'abcDEF12', viewerName: 'user2' });
    expect(essentials(decoded.sdp)).toEqual(essentials(SDP));
  });

  it('is short: a description of the usual shape takes a few dozen characters over its secrets', async () => {
    const code = await encodeInvitation(INVITATION);

    // The fingerprint alone is 43 characters; the rest is the address, the user name and password.
    expect(code.length).toBeLessThan(150);
    expect(code.length).toBeLessThan(
      (await encodeInvitation({ ...INVITATION, inviteId: 'abcDEF123_-x' })).length,
    );
  });

  it('round-trips a description the packed form cannot hold, as the whole text', async () => {
    const code = await encodeInvitation({ ...INVITATION, sdp: ODD_SDP });

    expect(bodyOf(code)[0]).toBe(1);
    expect(await decodeInvitation(code)).toEqual({
      kind: 'invitation',
      ...INVITATION,
      sdp: ODD_SDP,
    });
  });

  it('round-trips an invite id that is not six bytes long, as the whole text', async () => {
    const invitation = { ...INVITATION, inviteId: 'abcDEF123_-x' };
    const code = await encodeInvitation(invitation);

    expect(bodyOf(code)[0]).toBe(1);
    expect((await decodeInvitation(code)).inviteId).toBe('abcDEF123_-x');
  });

  it('round-trips names with letters outside ASCII', async () => {
    const name = 'Jürgen 🎬 ñ';
    const code = await encodeReply({ ...REPLY, viewerName: name });

    expect(bodyOf(code)[0]).toBe(0);
    expect((await decodeReply(code)).viewerName).toBe(name);
  });

  it('makes invite ids the compact form can hold, and no two alike', () => {
    const ids = Array.from({ length: 200 }, () => newInviteId());

    expect(ids.every((id) => /^[A-Za-z0-9_-]{8}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tolerates whitespace and line breaks added by messengers', async () => {
    const code = await encodeInvitation(INVITATION);
    const wrapped = `  ${code.slice(0, 20)}\n${code.slice(20, 40)} \r\n${code.slice(40)}\n`;

    expect((await decodeInvitation(wrapped)).hostName).toBe('user1');
  });

  it('rejects an empty code', async () => {
    await expectReason(decodeInvitation('  \n '), 'empty');
  });

  it('rejects text that is not a WatchP2PStream code', async () => {
    await expectReason(decodeInvitation('hello there'), 'malformed');
  });

  it('rejects a reply where an invitation is expected and vice versa', async () => {
    await expectReason(decodeInvitation(await encodeReply(REPLY)), 'wrong-kind');
    await expectReason(decodeReply(await encodeInvitation(INVITATION)), 'wrong-kind');
  });

  it('rejects a code of another format version', async () => {
    const code = await encodeInvitation(INVITATION);
    await expectReason(decodeInvitation(code.replace(/^WSI2/, 'WSI1')), 'unsupported-version');
    await expectReason(decodeInvitation(code.replace(/^WSI2/, 'WSI3')), 'unsupported-version');
  });

  it('rejects a truncated code, whatever kind it is', async () => {
    for (const sdp of [SDP, ODD_SDP]) {
      const code = await encodeInvitation({ ...INVITATION, sdp });
      await expectReason(decodeInvitation(code.slice(0, code.length - 15)), 'malformed');
    }
  });

  it('rejects every cut of a compact code', async () => {
    const code = await encodeInvitation(INVITATION);

    for (let length = code.indexOf('.') + 1; length < code.length; length += 1) {
      await expectReason(decodeInvitation(code.slice(0, length)), 'malformed');
    }
  });

  it('rejects a compact code with something after the description', async () => {
    const body = bodyOf(await encodeInvitation(INVITATION));
    const code = withBody('WSI2.x', new Uint8Array([...body, 0]));

    await expectReason(decodeInvitation(code), 'malformed');
  });

  it('rejects a body of a kind it does not know', async () => {
    const body = bodyOf(await encodeInvitation(INVITATION));
    body[0] = 7;

    await expectReason(decodeInvitation(withBody('WSI2.x', body)), 'malformed');
  });

  it('rejects a compact name that is not valid text, empty or too long', async () => {
    const code = await encodeInvitation(INVITATION);
    const body = bodyOf(code);
    // [0] kind, [1..6] id, [7] name length, [8..] name.
    const invalidText = body.slice();
    invalidText[8] = 0xff;

    await expectReason(decodeInvitation(withBody(code, invalidText)), 'malformed');
    await expectReason(
      decodeInvitation(await encodeInvitation({ ...INVITATION, hostName: ' ' })),
      'malformed',
    );
    await expectReason(
      decodeInvitation(await encodeInvitation({ ...INVITATION, hostName: 'x'.repeat(41) })),
      'malformed',
    );
  });

  it.each([
    ['a payload of the wrong kind', { ...INVITATION, kind: 'reply' }],
    ['an invalid invite id', { ...INVITATION, kind: 'invitation', inviteId: 'short' }],
    ['a missing name', { ...INVITATION, kind: 'invitation', hostName: ' ' }],
    ['a too long name', { ...INVITATION, kind: 'invitation', hostName: 'x'.repeat(41) }],
    ['a payload without SDP', { ...INVITATION, kind: 'invitation', sdp: 'nope' }],
    ['a payload that is not an object', ['WSI2']],
  ])('rejects the whole text with %s', async (_label, payload) => {
    await expectReason(decodeInvitation(await fullCode('WSI2', payload)), 'malformed');
  });
});
