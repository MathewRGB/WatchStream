import { describe, expect, it, vi } from 'vitest';
import { decodeReply, encodeInvitation } from '../handshake/handshake-code';
import { serialize } from '../protocol/messages';
import { FakeNetwork, type FakeLink } from '../testing/fake-network';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';
import type { HostSession } from './host-session';
import { ViewerSession } from './viewer-session';

/** A stream with the given fake tracks; happy-dom's MediaStream keeps them in `tracks`. */
function streamOf(...tracks: string[]): MediaStream {
  return new MediaStream(tracks as unknown as MediaStreamTrack[]);
}

interface Room {
  host: HostSession;
  network: FakeNetwork;
  viewers: ViewerSession[];
  /** The host's link to viewer `i`. */
  hostLink: (i: number) => FakeLink;
  /** The viewer's own link to the host. */
  viewerLink: (i: number) => FakeLink;
  ids: string[];
}

async function room(viewerCount: number): Promise<Room> {
  const { host, network } = createHost();
  const viewers: ViewerSession[] = [];
  const ids: string[] = [];
  for (let i = 1; i <= viewerCount; i++) {
    const { viewer, participant } = await joinViewer(host, network, `viewer${i}`);
    viewers.push(viewer);
    ids.push(participant.id);
  }
  return {
    host,
    network,
    viewers,
    ids,
    hostLink: (i) => network.offers[i]!,
    viewerLink: (i) => network.answers[i]!,
  };
}

/** The sharer asks, the host allows, and the picture reaches the host. */
async function startViewerShare(r: Room, sharer = 0): Promise<MediaStream> {
  const own = streamOf('sharer-video');
  r.viewers[sharer]!.requestShare(own);
  await flush();
  r.host.allowShare(r.ids[sharer]!);
  await flush();
  return own;
}

describe('a viewer shares', () => {
  it('asks the host, who sees the request and answers it', async () => {
    const r = await room(2);
    const onRequests = vi.fn();
    r.host.events.on('shareRequests', onRequests);

    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();

    expect(r.viewers[0]!.share).toBe('requested');
    expect(r.host.shareRequests.map((p) => p.name)).toEqual(['viewer1']);
    expect(onRequests).toHaveBeenLastCalledWith(r.host.shareRequests);
    expect(r.hostLink(0).outgoing).toBeNull();
  });

  it('sends the stream only once the host has allowed it', async () => {
    const r = await room(2);
    const own = streamOf('v');
    r.viewers[0]!.requestShare(own);
    await flush();
    expect(r.viewerLink(0).outgoing).toBeNull();

    r.host.allowShare(r.ids[0]!);
    await flush();

    expect(r.viewers[0]!.share).toBe('sharing');
    expect(r.viewerLink(0).outgoing).toBe(own);
    expect(r.host.shareRequests).toEqual([]);
  });

  it('shows the picture to the host and passes it on to the other viewers, not back to the sharer', async () => {
    const r = await room(3);
    const onIncoming = vi.fn();
    r.host.events.on('incoming', onIncoming);
    const onMedia = vi.fn();
    r.viewers[1]!.events.on('media', onMedia);

    await startViewerShare(r, 0);

    const picture = r.hostLink(0).remoteStream;
    expect(r.host.incoming).toEqual({ sourceId: r.ids[0], stream: picture });
    expect(onIncoming).toHaveBeenCalledWith({ sourceId: r.ids[0], stream: picture });
    expect(r.hostLink(1).outgoing).toBe(picture);
    expect(r.hostLink(2).outgoing).toBe(picture);
    expect(r.hostLink(0).outgoing).toBeNull();
    // The other viewers are told whose picture it is.
    expect(onMedia).toHaveBeenCalledWith({ sourceId: r.ids[0], stream: expect.anything() });
    expect(r.viewers[1]!.media?.sourceId).toBe(r.ids[0]);
    expect(r.viewers[0]!.media).toBeNull();
  });

  it('answers the sharer offer with an answer that names the sharer', async () => {
    const r = await room(1);

    await startViewerShare(r, 0);

    expect(r.hostLink(0).received.map((signal) => signal.type)).toEqual(['offer']);
    expect(r.viewerLink(0).received.map((signal) => signal.type)).toEqual(['answer']);
  });

  it('gives the picture to a viewer who joins during the share', async () => {
    const r = await room(1);
    await startViewerShare(r, 0);

    const late = await joinViewer(r.host, r.network, 'late');

    expect(late.viewer.media?.sourceId).toBe(r.ids[0]);
    expect(r.network.offers[1]!.outgoing).toBe(r.hostLink(0).remoteStream);
  });

  it('syncs the links when a later track, the sound, arrives', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);
    const picture = r.hostLink(0).remoteStream;
    (picture as unknown as { tracks: unknown[] }).tracks.push('sharer-audio');
    const before = r.network.nextMedia;

    r.hostLink(0).emitter.emit('stream', picture);
    await flush();

    // `setOutgoing` saw a changed track list on the same stream and negotiated again.
    expect(r.network.nextMedia).toBe(before + 1);
    expect(r.hostLink(1).outgoing).toBe(picture);
  });

  it('turns a request down: the viewer is told and is free to ask again', async () => {
    const r = await room(1);
    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();

    r.host.declineShare(r.ids[0]!);
    await flush();

    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.viewers[0]!.lastShareEnd).toBe('declined');
    expect(r.host.shareRequests).toEqual([]);
    expect(() => r.viewers[0]!.requestShare(streamOf('again'))).not.toThrow();
  });

  it('says busy at once while the host shares', async () => {
    const r = await room(1);
    r.host.startSharing(streamOf('host-video'));
    await flush();

    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();

    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.viewers[0]!.lastShareEnd).toBe('busy');
    expect(r.host.shareRequests).toEqual([]);
  });

  it('answers a waiting request busy when the host starts to share', async () => {
    const r = await room(1);
    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();
    const onRequests = vi.fn();
    r.host.events.on('shareRequests', onRequests);

    r.host.startSharing(streamOf('host-video'));
    await flush();

    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.viewers[0]!.lastShareEnd).toBe('busy');
    expect(r.viewers[0]!.ownShare).toBeNull();
    expect(r.host.shareRequests).toEqual([]);
    expect(onRequests).toHaveBeenLastCalledWith([]);
  });

  it('allows one viewer and answers the other waiting requests busy', async () => {
    const r = await room(3);
    r.viewers[0]!.requestShare(streamOf('a'));
    r.viewers[1]!.requestShare(streamOf('b'));
    await flush();
    expect(r.host.shareRequests.map((p) => p.name)).toEqual(['viewer1', 'viewer2']);

    r.host.allowShare(r.ids[0]!);
    await flush();

    expect(r.viewers[0]!.share).toBe('sharing');
    expect(r.viewers[1]!.share).toBe('idle');
    expect(r.viewers[1]!.lastShareEnd).toBe('busy');
    expect(r.host.shareRequests).toEqual([]);
  });

  it('says busy to a request while another viewer shares', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);

    r.viewers[1]!.requestShare(streamOf('b'));
    await flush();

    expect(r.viewers[1]!.lastShareEnd).toBe('busy');
  });

  it('ends the share for everyone when the sharer stops', async () => {
    const r = await room(3);
    const own = await startViewerShare(r, 0);
    const onMedia = vi.fn();
    r.viewers[1]!.events.on('media', onMedia);
    const onIncoming = vi.fn();
    r.host.events.on('incoming', onIncoming);

    r.viewers[0]!.stopSharing();
    await flush();

    expect(own).toBeDefined();
    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.viewers[0]!.lastShareEnd).toBeNull();
    expect(r.viewerLink(0).outgoing).toBeNull();
    expect(r.host.incoming).toBeNull();
    expect(onIncoming).toHaveBeenLastCalledWith(null);
    expect(r.hostLink(1).outgoing).toBeNull();
    expect(r.hostLink(2).outgoing).toBeNull();
    expect(onMedia).toHaveBeenLastCalledWith(null);
    expect(r.viewers[1]!.media).toBeNull();
  });

  it('answers the offer that takes the sharer tracks away, so the link can negotiate again', async () => {
    const r = await room(1);
    await startViewerShare(r, 0);

    r.viewers[0]!.stopSharing();
    await flush();

    // Offer to start, offer to stop: both got an answer.
    expect(r.hostLink(0).received.map((signal) => signal.type)).toEqual(['offer', 'offer']);
    expect(r.viewerLink(0).received.map((signal) => signal.type)).toEqual(['answer', 'answer']);
  });

  it('cancels a request that was not answered yet', async () => {
    const r = await room(1);
    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();

    r.viewers[0]!.stopSharing();
    await flush();

    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.host.shareRequests).toEqual([]);
  });

  it('ends the share when the host revokes it, and tells the sharer', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);

    r.host.revokeShare();
    await flush();

    expect(r.viewers[0]!.share).toBe('idle');
    expect(r.viewers[0]!.lastShareEnd).toBe('revoked');
    expect(r.viewerLink(0).outgoing).toBeNull();
    expect(r.host.incoming).toBeNull();
    expect(r.viewers[1]!.media).toBeNull();
  });

  it('lets the host take the stage: its own share revokes the viewer', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);

    const own = streamOf('host-video');
    r.host.startSharing(own);
    await flush();

    expect(r.viewers[0]!.lastShareEnd).toBe('revoked');
    expect(r.host.incoming).toBeNull();
    expect(r.hostLink(1).outgoing).toBe(own);
    expect(r.viewers[1]!.media?.sourceId).toBe(r.host.hostId);
  });

  it('ends the share when the sharer leaves', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);

    r.viewers[0]!.leave();
    await flush();

    expect(r.host.incoming).toBeNull();
    expect(r.hostLink(1).outgoing).toBeNull();
    expect(r.viewers[1]!.media).toBeNull();
    // The place for the next share is free.
    r.viewers[1]!.requestShare(streamOf('b'));
    await flush();
    expect(r.host.shareRequests.map((p) => p.name)).toEqual(['viewer2']);
  });

  it('ends the share when the host removes the sharer', async () => {
    const r = await room(2);
    await startViewerShare(r, 0);

    r.host.removeViewer(r.ids[0]!);
    await flush();

    expect(r.host.incoming).toBeNull();
    expect(r.viewers[1]!.media).toBeNull();
  });

  it('drops the request of a viewer who leaves before the host answers', async () => {
    const r = await room(2);
    r.viewers[0]!.requestShare(streamOf('v'));
    await flush();

    r.viewers[0]!.leave();
    await flush();

    expect(r.host.shareRequests).toEqual([]);
  });

  it('does not pass on the picture of a viewer who was not allowed', async () => {
    const r = await room(2);
    const outsider = streamOf('x');

    // A viewer that skips the request and offers media anyway.
    r.viewerLink(0).setOutgoing(outsider);
    await flush();

    expect(r.hostLink(0).received.map((signal) => signal.type)).toEqual(['offer']);
    expect(r.host.incoming).toBeNull();
    expect(r.hostLink(1).outgoing).toBeNull();
  });

  it('ignores an offer that names another participant as its source', async () => {
    const r = await room(2);

    r.hostLink(0).receive(serialize({ type: 'media-offer', sourceId: r.ids[1]!, sdp: 'v=0\r\n' }));
    await flush();

    expect(r.hostLink(0).received).toEqual([]);
  });

  it('refuses to ask before the host has welcomed it: its offer could not name it', async () => {
    // A link that opened, from a host that never sends its welcome.
    const network = new FakeNetwork();
    const { link, sdp } = await network.createOffer();
    const code = await encodeInvitation({ inviteId: 'invite-0001', hostName: 'Host', sdp });
    const { session, replyCode } = await ViewerSession.join(code, {
      viewerName: 'viewer1',
      connector: network,
    });
    await link.acceptAnswer((await decodeReply(replyCode)).sdp);
    await flush();
    expect(session.state).toBe('connected');

    expect(() => session.requestShare(streamOf('v'))).toThrow(/Not connected/);
    expect(session.share).toBe('idle');
  });

  it('refuses a second request while one is running or asked for', async () => {
    const r = await room(1);
    r.viewers[0]!.requestShare(streamOf('v'));

    expect(() => r.viewers[0]!.requestShare(streamOf('w'))).toThrow(/already/);
  });

  it('keeps the load monitor on while a viewer picture is passed on, without reading the sharer', async () => {
    const { host, network } = createHost({ monitorIntervalMs: 10 });
    const first = await joinViewer(host, network, 'viewer1');
    await joinViewer(host, network, 'viewer2');
    const statsOfSharer = vi.spyOn(network.answers[0]!, 'stats');
    const statsOfHostLinkToSharer = vi.spyOn(network.offers[0]!, 'stats');
    const statsOfOther = vi.spyOn(network.offers[1]!, 'stats');

    first.viewer.requestShare(streamOf('v'));
    await flush();
    host.allowShare(first.participant.id);
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 60));
    host.close();

    expect(statsOfOther).toHaveBeenCalled();
    expect(statsOfHostLinkToSharer).not.toHaveBeenCalled();
    expect(statsOfSharer).not.toHaveBeenCalled();
  });
});
