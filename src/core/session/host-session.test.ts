import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeInvitation, HandshakeCodeError } from '../handshake/handshake-code';
import { clearLogHistory, logHistory, setLogSink } from '../log/logger';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';
import { SessionError } from './session-error';
import { ViewerSession } from './viewer-session';

describe('HostSession', () => {
  it('starts with only the host in the session', () => {
    const { host } = createHost({ hostName: 'user1' });

    expect(host.participants).toEqual([{ id: host.hostId, name: 'user1', role: 'host' }]);
    expect(host.openSlots).toBe(3);
  });

  it('creates an invitation code that names the host', async () => {
    const { host } = createHost({ hostName: 'user1' });

    const { inviteId, code } = await host.createInvitation();
    const invitation = await decodeInvitation(code);

    expect(invitation.inviteId).toBe(inviteId);
    expect(invitation.hostName).toBe('user1');
    expect(host.openSlots).toBe(2);
  });

  it('adds a viewer once the reply is accepted and the link opens', async () => {
    const { host, network } = createHost();
    const onRoster = vi.fn();
    host.events.on('roster', onRoster);

    const { participant } = await joinViewer(host, network, 'user2');

    expect(participant).toMatchObject({ name: 'user2', role: 'viewer' });
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user2']);
    expect(onRoster).toHaveBeenLastCalledWith(host.participants);
  });

  it('welcomes the viewer and sends the roster to it', async () => {
    const { host, network } = createHost();

    const { viewer, participant } = await joinViewer(host, network, 'user2');

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
    const { viewer } = await joinViewer(host, network, 'user2');
    expect(host.openSlots).toBe(0);

    viewer.leave();
    await flush();

    expect(host.openSlots).toBe(1);
    expect(host.participants).toHaveLength(1);
  });

  it('keeps the place reserved while a reply is still connecting', async () => {
    const { host, network } = createHost({ maxViewers: 1, connectTimeoutMs: 200 });
    network.blockConnections = true;
    const { code } = await host.createInvitation();
    const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });

    const accepting = host.acceptReply(replyCode).catch(() => undefined);
    await flush();

    expect(host.openSlots).toBe(0);
    await expect(host.createInvitation()).rejects.toMatchObject({ reason: 'session-full' });
    await accepting;
    expect(host.openSlots).toBe(1);
  });

  describe('slots event', () => {
    it('reports the free places whenever an invitation is created or cancelled', async () => {
      const { host } = createHost();
      const onSlots = vi.fn();
      host.events.on('slots', onSlots);

      const { inviteId } = await host.createInvitation();
      host.cancelInvitation(inviteId);

      expect(onSlots.mock.calls).toEqual([[2], [3]]);
    });

    it('does not report cancelling an unknown invitation', () => {
      const { host } = createHost();
      const onSlots = vi.fn();
      host.events.on('slots', onSlots);

      host.cancelInvitation('unknown');

      expect(onSlots).not.toHaveBeenCalled();
    });

    it('reports the final value once a viewer has joined, never a transient one', async () => {
      const { host, network } = createHost();
      const { code } = await host.createInvitation();
      const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });
      const onSlots = vi.fn();
      host.events.on('slots', onSlots);

      await host.acceptReply(replyCode);

      expect(onSlots.mock.calls).toEqual([[2]]);
    });

    it('gives the place back when connecting fails', async () => {
      const { host, network } = createHost({ connectTimeoutMs: 20 });
      network.blockConnections = true;
      const { code } = await host.createInvitation();
      const { replyCode } = await ViewerSession.join(code, { viewerName: 'J', connector: network });
      const onSlots = vi.fn();
      host.events.on('slots', onSlots);

      await host.acceptReply(replyCode).catch(() => undefined);

      expect(onSlots.mock.calls).toEqual([[3]]);
    });

    it('reports a place freed by a leaving viewer', async () => {
      const { host, network } = createHost();
      const { viewer } = await joinViewer(host, network, 'user2');
      const onSlots = vi.fn();
      host.events.on('slots', onSlots);

      viewer.leave();
      await flush();

      expect(onSlots.mock.calls).toEqual([[3]]);
    });
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
      const { viewer: user2 } = await joinViewer(host, network, 'user2');
      const { viewer: user3 } = await joinViewer(host, network, 'user3');
      const seen = { host: vi.fn(), user2: vi.fn(), user3: vi.fn() };
      host.events.on('chat', seen.host);
      user2.events.on('chat', seen.user2);
      user3.events.on('chat', seen.user3);

      host.sendChat('  popcorn ready? ');
      await flush();

      const expected = expect.objectContaining({
        senderId: host.hostId,
        senderName: 'Host',
        text: 'popcorn ready?',
        sentAt: 1_000,
      });
      expect(seen.host).toHaveBeenCalledWith(expected);
      expect(seen.user2).toHaveBeenCalledWith(expected);
      expect(seen.user3).toHaveBeenCalledWith(expected);
    });

    it('relays a viewer message to everyone, including the sender', async () => {
      const { host, network } = createHost();
      const { viewer: user2, participant } = await joinViewer(host, network, 'user2');
      const { viewer: user3 } = await joinViewer(host, network, 'user3');
      const seen = { host: vi.fn(), user2: vi.fn(), user3: vi.fn() };
      host.events.on('chat', seen.host);
      user2.events.on('chat', seen.user2);
      user3.events.on('chat', seen.user3);

      user2.sendChat('yes!');
      await flush();
      await flush();

      const expected = expect.objectContaining({
        senderId: participant.id,
        senderName: 'user2',
        text: 'yes!',
      });
      expect(seen.host).toHaveBeenCalledWith(expected);
      expect(seen.user2).toHaveBeenCalledWith(expected);
      expect(seen.user3).toHaveBeenCalledWith(expected);
    });

    it('ignores invalid messages from viewers', async () => {
      const { host, network } = createHost();
      await joinViewer(host, network, 'user2');
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
    await joinViewer(host, network, 'user2');
    await host.createInvitation();

    host.close();

    expect(network.offers).toHaveLength(2);
    expect(network.offers.every((link) => link.state === 'closed')).toBe(true);
  });

  it('keeps relaying to the other viewers and drops the one whose link fails', async () => {
    const { host, network } = createHost();
    const first = await joinViewer(host, network, 'user2');
    const second = await joinViewer(host, network, 'user3');
    const onChat = vi.fn();
    second.viewer.events.on('chat', onChat);
    network.offers[0]!.failSends = true;

    host.sendChat('hello');
    await flush();

    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }));
    expect(first.viewer.state).toBe('disconnected');
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
  });

  describe('sharing', () => {
    const stream = { id: 'stream-1' } as MediaStream;

    it('offers the stream to every viewer and tells them who shares', async () => {
      const { host, network } = createHost();
      const first = await joinViewer(host, network, 'user2');
      const second = await joinViewer(host, network, 'user3');
      const onMedia = vi.fn();
      first.viewer.events.on('media', onMedia);
      second.viewer.events.on('media', onMedia);

      host.startSharing(stream);
      await flush();

      expect(network.offers.map((link) => link.outgoing)).toEqual([stream, stream]);
      expect(onMedia).toHaveBeenCalledTimes(2);
      expect(onMedia).toHaveBeenCalledWith(expect.objectContaining({ sourceId: host.hostId }));
      expect(host.sharedStream).toBe(stream);
    });

    it('applies a viewer answer to that viewer link only', async () => {
      const { host, network } = createHost();
      await joinViewer(host, network, 'user2');
      await joinViewer(host, network, 'user3');

      host.startSharing(stream);
      await flush();

      expect(network.offers.map((link) => link.received.map((s) => s.type))).toEqual([
        ['answer'],
        ['answer'],
      ]);
    });

    it('shares with a viewer who joins later', async () => {
      const { host, network } = createHost();
      host.startSharing(stream);

      const { viewer } = await joinViewer(host, network, 'user2');
      await flush();

      expect(viewer.media).toMatchObject({ sourceId: host.hostId });
    });

    it('stops the share for everyone and tells the viewers', async () => {
      const { host, network } = createHost();
      const { viewer } = await joinViewer(host, network, 'user2');
      host.startSharing(stream);
      await flush();
      const onMedia = vi.fn();
      viewer.events.on('media', onMedia);

      host.stopSharing();
      await flush();

      expect(network.offers[0]!.outgoing).toBeNull();
      expect(onMedia).toHaveBeenCalledWith(null);
      expect(viewer.media).toBeNull();
      expect(host.sharedStream).toBeNull();
    });

    it('ignores a media answer that names someone else as the source', async () => {
      const { host, network } = createHost();
      const { viewer } = await joinViewer(host, network, 'user2');
      network.offers[0]!.receive(
        JSON.stringify({ type: 'media-answer', sourceId: 'someone-else', sdp: 'v=0\r\n' }),
      );
      await flush();

      expect(network.offers[0]!.received).toEqual([]);
      expect(viewer.state).toBe('connected');
    });

    it('drops only the viewer whose link fails while sharing starts', async () => {
      const { host, network } = createHost();
      await joinViewer(host, network, 'user2');
      const { viewer: second } = await joinViewer(host, network, 'user3');
      network.offers[0]!.setOutgoing = () => {
        throw new Error('link broke');
      };

      host.startSharing(stream);
      await flush();

      expect(second.media).not.toBeNull();
      expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
    });
  });

  describe('quality', () => {
    it('starts balanced and limits every viewer link to the chosen preset', async () => {
      const { host, network } = createHost();
      await joinViewer(host, network, 'user2');
      await joinViewer(host, network, 'user3');
      expect(host.quality).toBe('balanced');

      host.setQuality('saver');
      await flush();

      expect(host.quality).toBe('saver');
      expect(network.offers.map((link) => link.limits)).toEqual([
        expect.objectContaining({ maxHeight: 480, maxBitrateBps: 1_500_000 }),
        expect.objectContaining({ maxHeight: 480, maxBitrateBps: 1_500_000 }),
      ]);
    });

    it('applies the current preset to a viewer who joins later', async () => {
      const { host, network } = createHost();
      host.setQuality('sharp');

      await joinViewer(host, network, 'user2');

      expect(network.offers[0]!.limits).toMatchObject({ maxHeight: 1080 });
    });

    it('keeps a viewer when limits cannot be set on its link', async () => {
      const { host, network } = createHost();
      const { viewer } = await joinViewer(host, network, 'user2');
      network.offers[0]!.setMediaLimits = async () => {
        throw new Error('no encodings yet');
      };

      host.setQuality('saver');
      await flush();

      expect(viewer.state).toBe('connected');
    });
  });

  describe('diagnostics and logging', () => {
    beforeEach(() => {
      clearLogHistory();
      setLogSink(() => {});
    });
    afterEach(() => setLogSink(null));

    it('explains a connection that never opened, with technical details', async () => {
      const { host, network } = createHost({ connectTimeoutMs: 30 });
      network.blockConnections = true;
      const { code } = await host.createInvitation();
      const { replyCode } = await ViewerSession.join(code, {
        viewerName: 'user2',
        connector: network,
      });

      const failure = await host.acceptReply(replyCode).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(SessionError);
      expect(failure).toMatchObject({ reason: 'connection-failed' });
      expect((failure as SessionError).details).toMatch(/^Connection: connecting, ICE: connecting/);
      expect(logHistory()).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          message: 'viewer link did not open',
          data: expect.objectContaining({ cause: 'timeout' }),
        }),
      );
      expect(host.openSlots).toBe(3);
    });

    it('logs who came and went by count only, and a dropped broken link', async () => {
      const { host, network } = createHost();
      const { viewer } = await joinViewer(host, network, 'user2');
      network.offers[0]!.failSends = true;

      host.sendChat('hi');
      await flush();

      const messages = logHistory().map((entry) => entry.message);
      expect(messages).toContain('viewer joined');
      expect(messages).toContain('dropped a viewer whose link failed during sending');
      expect(messages).toContain('viewer left');
      expect(viewer.state).toBe('disconnected');
    });

    it('never puts codes, descriptions, names or chat text into the log', async () => {
      const { host, network } = createHost({ hostName: 'SecretHostName' });
      const { code } = await host.createInvitation();
      const { session, replyCode } = await ViewerSession.join(code, {
        viewerName: 'SecretViewerName',
        connector: network,
      });
      await host.acceptReply(replyCode);
      await flush();
      host.sendChat('a private chat text');
      session.sendChat('another private chat text');
      host.startSharing(new MediaStream());
      await flush();
      host.stopSharing();
      session.leave();
      await flush();

      const everything = JSON.stringify(logHistory());

      expect(logHistory().length).toBeGreaterThan(5);
      expect(everything).not.toMatch(/WSI1|WSR1|v=0|SecretHostName|SecretViewerName|private chat/);
    });
  });
});
