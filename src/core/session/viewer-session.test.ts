import { describe, expect, it, vi } from 'vitest';
import { decodeReply, HandshakeCodeError } from '../handshake/handshake-code';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';
import { ViewerSession } from './viewer-session';

describe('ViewerSession', () => {
  it('creates a reply code for the invitation and waits for the host', async () => {
    const { host, network } = createHost({ hostName: 'Mathias' });
    const { inviteId, code } = await host.createInvitation();

    const { session, replyCode } = await ViewerSession.join(code, {
      viewerName: 'Julia',
      connector: network,
    });
    const reply = await decodeReply(replyCode);

    expect(reply).toMatchObject({ inviteId, viewerName: 'Julia' });
    expect(session.hostName).toBe('Mathias');
    expect(session.state).toBe('waiting-for-host');
  });

  it('becomes connected once the host accepts the reply', async () => {
    const { host, network } = createHost();
    const { code } = await host.createInvitation();
    const { session, replyCode } = await ViewerSession.join(code, {
      viewerName: 'Julia',
      connector: network,
    });
    const onState = vi.fn();
    session.events.on('state', onState);

    await host.acceptReply(replyCode);
    await flush();

    expect(session.state).toBe('connected');
    expect(onState).toHaveBeenCalledWith('connected');
  });

  it('becomes disconnected when the host closes the session', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');
    const onState = vi.fn();
    viewer.events.on('state', onState);

    host.close();
    await flush();

    expect(viewer.state).toBe('disconnected');
    expect(onState).toHaveBeenCalledWith('disconnected');
  });

  it('rejects a reply code pasted as an invitation', async () => {
    const { host, network } = createHost();
    const { code } = await host.createInvitation();
    const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });

    await expect(
      ViewerSession.join(replyCode, { viewerName: 'J', connector: network }),
    ).rejects.toBeInstanceOf(HandshakeCodeError);
  });

  it('refuses to chat before it is connected', async () => {
    const { host, network } = createHost();
    const { code } = await host.createInvitation();
    const { session } = await ViewerSession.join(code, { viewerName: 'J', connector: network });

    expect(() => session.sendChat('hi')).toThrow(
      expect.objectContaining({ reason: 'not-connected' }),
    );
  });

  it('refuses an empty chat message', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');

    expect(() => viewer.sendChat(' ')).toThrow(
      expect.objectContaining({ reason: 'invalid-message' }),
    );
  });

  it('ignores invalid messages from the host', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');
    const onChat = vi.fn();
    const onRoster = vi.fn();
    viewer.events.on('chat', onChat);
    viewer.events.on('roster', onRoster);
    const hostLinkOnViewerSide = network.answers[0];

    hostLinkOnViewerSide?.receive('{"type":"chat","message":{}}');
    hostLinkOnViewerSide?.receive('[]');

    expect(onChat).not.toHaveBeenCalled();
    expect(onRoster).not.toHaveBeenCalled();
  });

  it('stops emitting after leaving', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');
    const onChat = vi.fn();
    viewer.events.on('chat', onChat);

    viewer.leave();
    host.sendChat('anyone?');
    await flush();

    expect(onChat).not.toHaveBeenCalled();
    expect(viewer.state).toBe('disconnected');
  });
});
