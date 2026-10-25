import { describe, expect, it, vi } from 'vitest';
import { decodeInvitation, HandshakeCodeError } from '../handshake/handshake-code';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';
import { SessionError } from './session-error';
import { ViewerSession } from './viewer-session';

describe('HostSession', () => {
  it('starts with only the host in the session', () => {
    const { host } = createHost({ hostName: 'Mathias' });

    expect(host.participants).toEqual([{ id: host.hostId, name: 'Mathias', role: 'host' }]);
    expect(host.openSlots).toBe(3);
  });

  it('creates an invitation code that names the host', async () => {
    const { host } = createHost({ hostName: 'Mathias' });

    const { inviteId, code } = await host.createInvitation();
    const invitation = await decodeInvitation(code);

    expect(invitation.inviteId).toBe(inviteId);
    expect(invitation.hostName).toBe('Mathias');
    expect(host.openSlots).toBe(2);
  });

  it('adds a viewer once the reply is accepted and the link opens', async () => {
    const { host, network } = createHost();
    const onRoster = vi.fn();
    host.events.on('roster', onRoster);

    const { participant } = await joinViewer(host, network, 'Julia');

    expect(participant).toMatchObject({ name: 'Julia', role: 'viewer' });
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'Julia']);
    expect(onRoster).toHaveBeenLastCalledWith(host.participants);
  });

  it('welcomes the viewer and sends the roster to it', async () => {
    const { host, network } = createHost();

    const { viewer, participant } = await joinViewer(host, network, 'Julia');

    expect(viewer.participantId).toBe(participant.id);
    expect(viewer.participants).toEqual(host.participants);
  });

  it('refuses more invitations than free slots', async () => {
    const { host } = createHost({ maxViewers: 2 });
    await host.createInvitation();
    await host.createInvitation();

    await expect(host.createInvitation()).rejects.toMatchObject({ reason: 'session-full' });
  });

  it('frees the slot of a cancelled invitation', async () => {
    const { host } = createHost({ maxViewers: 1 });
    const { inviteId } = await host.createInvitation();

    host.cancelInvitation(inviteId);

    expect(host.openSlots).toBe(1);
    await expect(host.createInvitation()).resolves.toBeDefined();
  });

  it('frees the slot when a viewer leaves and updates the roster', async () => {
    const { host, network } = createHost({ maxViewers: 1 });
    const { viewer } = await joinViewer(host, network, 'Julia');
    expect(host.openSlots).toBe(0);

    viewer.leave();
    await flush();

    expect(host.openSlots).toBe(1);
    expect(host.participants).toHaveLength(1);
  });

  it('accepts a reply only once', async () => {
    const { host, network } = createHost();
    const { code } = await host.createInvitation();
    const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });
    await host.acceptReply(replyCode);

    await expect(host.acceptReply(replyCode)).rejects.toMatchObject({
      reason: 'unknown-invitation',
    });
  });

  it('rejects a reply for a cancelled invitation', async () => {
    const { host, network } = createHost();
    const { inviteId, code } = await host.createInvitation();
    const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });

    host.cancelInvitation(inviteId);

    await expect(host.acceptReply(replyCode)).rejects.toBeInstanceOf(SessionError);
  });

  it('rejects an invitation code pasted as a reply', async () => {
    const { host } = createHost();
    const { code } = await host.createInvitation();

    await expect(host.acceptReply(code)).rejects.toBeInstanceOf(HandshakeCodeError);
  });

  it('gives up when no connection opens in time', async () => {
    // A short real timeout: fake timers would also freeze the compression streams.
    const { host, network } = createHost({ connectTimeoutMs: 50 });
    network.blockConnections = true;
    const { code } = await host.createInvitation();
    const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });

    await expect(host.acceptReply(replyCode)).rejects.toMatchObject({
      reason: 'connection-failed',
    });

    expect(host.participants).toHaveLength(1);
    expect(network.offers[0]?.state).toBe('closed');
  });

  describe('chat', () => {
    it('delivers host messages to the host and all viewers', async () => {
      const { host, network } = createHost();
      const { viewer: julia } = await joinViewer(host, network, 'Julia');
      const { viewer: tom } = await joinViewer(host, network, 'Tom');
      const seen = { host: vi.fn(), julia: vi.fn(), tom: vi.fn() };
      host.events.on('chat', seen.host);
      julia.events.on('chat', seen.julia);
      tom.events.on('chat', seen.tom);

      host.sendChat('  popcorn ready? ');
      await flush();

      const expected = expect.objectContaining({
        senderId: host.hostId,
        senderName: 'Host',
        text: 'popcorn ready?',
        sentAt: 1_000,
      });
      expect(seen.host).toHaveBeenCalledWith(expected);
      expect(seen.julia).toHaveBeenCalledWith(expected);
      expect(seen.tom).toHaveBeenCalledWith(expected);
    });

    it('relays a viewer message to everyone, including the sender', async () => {
      const { host, network } = createHost();
      const { viewer: julia, participant } = await joinViewer(host, network, 'Julia');
      const { viewer: tom } = await joinViewer(host, network, 'Tom');
      const seen = { host: vi.fn(), julia: vi.fn(), tom: vi.fn() };
      host.events.on('chat', seen.host);
      julia.events.on('chat', seen.julia);
      tom.events.on('chat', seen.tom);

      julia.sendChat('yes!');
      await flush();
      await flush();

      const expected = expect.objectContaining({
        senderId: participant.id,
        senderName: 'Julia',
        text: 'yes!',
      });
      expect(seen.host).toHaveBeenCalledWith(expected);
      expect(seen.julia).toHaveBeenCalledWith(expected);
      expect(seen.tom).toHaveBeenCalledWith(expected);
    });

    it('ignores invalid messages from viewers', async () => {
      const { host, network } = createHost();
      await joinViewer(host, network, 'Julia');
      const onChat = vi.fn();
      host.events.on('chat', onChat);
      const viewerLinkOnHostSide = network.offers[0];

      viewerLinkOnHostSide?.receive('{"type":"roster","participants":[]}');
      viewerLinkOnHostSide?.receive('not json');

      expect(onChat).not.toHaveBeenCalled();
      expect(host.participants).toHaveLength(2);
    });

    it('rejects an empty host message', () => {
      const { host } = createHost();

      expect(() => host.sendChat('   ')).toThrow(SessionError);
    });
  });

  it('closes every link on close', async () => {
    const { host, network } = createHost();
    await joinViewer(host, network, 'Julia');
    await host.createInvitation();

    host.close();

    expect(network.offers).toHaveLength(2);
    expect(network.offers.every((link) => link.state === 'closed')).toBe(true);
  });
});
