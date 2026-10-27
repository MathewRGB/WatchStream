import { afterEach, describe, expect, it } from 'vitest';
import {
  decodeInvitation,
  decodeReply,
  encodeInvitation,
  encodeReply,
} from '../../src/core/handshake/handshake-code';
import { PeerLink } from '../../src/core/peer/peer-link';
import { closed, LOCAL_CONFIG, nextMessage, opened } from './helpers';

const links: PeerLink[] = [];

async function connectPair(): Promise<{ host: PeerLink; viewer: PeerLink }> {
  const offer = await PeerLink.createOffer(LOCAL_CONFIG);
  const answer = await PeerLink.acceptOffer(offer.sdp, LOCAL_CONFIG);
  links.push(offer.link, answer.link);
  await offer.link.acceptAnswer(answer.sdp);
  await Promise.all([opened(offer.link), opened(answer.link)]);
  return { host: offer.link, viewer: answer.link };
}

afterEach(() => {
  links.splice(0).forEach((link) => link.close());
});

/** Makes the browser report a connection state, as it does when ICE gives up. */
function reportConnectionState(link: PeerLink, state: RTCPeerConnectionState): void {
  const connection = link['connection'];
  Object.defineProperty(connection, 'connectionState', { configurable: true, get: () => state });
  connection.dispatchEvent(new Event('connectionstatechange'));
}

describe('PeerLink', () => {
  it('opens a data channel and carries messages in both directions', async () => {
    const { host, viewer } = await connectPair();

    const toViewer = nextMessage(viewer);
    host.send('hello viewer');
    expect(await toViewer).toBe('hello viewer');

    const toHost = nextMessage(host);
    viewer.send('hello host');
    expect(await toHost).toBe('hello host');
  });

  it('keeps the order of many messages', async () => {
    const { host, viewer } = await connectPair();
    const received: string[] = [];
    const done = new Promise<void>((resolve) => {
      viewer.events.on('message', (data) => {
        received.push(data);
        if (received.length === 100) resolve();
      });
    });

    for (let i = 0; i < 100; i++) host.send(String(i));
    await done;

    expect(received).toEqual(Array.from({ length: 100 }, (_, i) => String(i)));
  });

  it('connects through encoded invitation and reply codes', async () => {
    const offer = await PeerLink.createOffer(LOCAL_CONFIG);
    links.push(offer.link);
    const invitationCode = await encodeInvitation({
      inviteId: 'integration-1',
      hostName: 'Host',
      sdp: offer.sdp,
    });

    const invitation = await decodeInvitation(invitationCode);
    const answer = await PeerLink.acceptOffer(invitation.sdp, LOCAL_CONFIG);
    links.push(answer.link);
    const replyCode = await encodeReply({
      inviteId: invitation.inviteId,
      viewerName: 'Viewer',
      sdp: answer.sdp,
    });

    await offer.link.acceptAnswer((await decodeReply(replyCode)).sdp);
    await Promise.all([opened(offer.link), opened(answer.link)]);

    // Codes have to fit comfortably into a messenger message.
    expect(invitationCode.length).toBeLessThan(2000);
    expect(replyCode.length).toBeLessThan(2000);
  });

  it('reports the remote side closing', async () => {
    const { host, viewer } = await connectPair();
    const viewerClosed = closed(viewer);

    host.close();

    await viewerClosed;
    expect(viewer.state).toBe('closed');
    expect(host.state).toBe('closed');
  });

  it('refuses to send before the link is open', async () => {
    const offer = await PeerLink.createOffer(LOCAL_CONFIG);
    links.push(offer.link);

    expect(offer.link.state).toBe('connecting');
    expect(() => offer.link.send('too early')).toThrow('not open');
  });

  it('rejects an invalid offer', async () => {
    await expect(PeerLink.acceptOffer('v=0\r\ngarbage\r\n', LOCAL_CONFIG)).rejects.toThrow();
  });

  it('keeps waiting when ICE fails before the channel ever opened', async () => {
    // The viewer's ICE starts before the host has the reply, which takes a person as long as a
    // chat message. A failure in that time says nothing about the connection the host starts next.
    const offer = await PeerLink.createOffer(LOCAL_CONFIG);
    const answer = await PeerLink.acceptOffer(offer.sdp, LOCAL_CONFIG);
    links.push(offer.link, answer.link);

    reportConnectionState(answer.link, 'failed');

    expect(answer.link.state).toBe('connecting');
    await offer.link.acceptAnswer(answer.sdp);
    await Promise.all([opened(offer.link), opened(answer.link)]);
  });

  it('closes when an open connection fails', async () => {
    const { host, viewer } = await connectPair();
    const viewerClosed = closed(viewer);

    reportConnectionState(viewer, 'failed');

    await viewerClosed;
    expect(viewer.state).toBe('closed');
    host.close();
  });

  it('closes when the connection is closed, open or not', async () => {
    const offer = await PeerLink.createOffer(LOCAL_CONFIG);
    links.push(offer.link);

    reportConnectionState(offer.link, 'closed');

    expect(offer.link.state).toBe('closed');
  });
});
