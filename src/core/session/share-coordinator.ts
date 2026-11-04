import { createLogger } from '../log/logger';
import type { MediaLink } from '../peer/message-link';
import type { HostMessage, Participant, ShareDenial } from '../protocol/messages';
import type { LoadControl } from './load-control';

/** A viewer's share, as the host sees it: who, and the picture that arrives from them. */
export interface IncomingShare {
  sourceId: string;
  stream: MediaStream;
}

/** The part of a viewer that sharing needs. */
export interface SharingViewer {
  participant: Participant;
  link: MediaLink;
}

/** What the coordinator needs from the host session around it; the session hands over closures. */
export interface SharingHost {
  hostId: () => string;
  /** The viewers who are in the session now. */
  viewers: () => ReadonlyMap<string, SharingViewer>;
  /** Never throws: a failing link is closed and drops out. */
  sendTo: (link: MediaLink, message: HostMessage) => void;
  /** Media trouble with one viewer must not affect the others; that viewer drops out. */
  guardMedia: (link: MediaLink, action: () => void) => void;
  load: Pick<LoadControl, 'start' | 'stop' | 'reset'>;
  /** Forgets what the viewers reported about a picture that is over. */
  clearReports: () => void;
  publishLoad: () => void;
  /** The host started (stream) or stopped (`null`) sharing. */
  onSharing: (stream: MediaStream | null) => void;
  /** A viewer's share started (its picture) or ended (`null`). */
  onIncoming: (share: IncomingShare | null) => void;
  /** The viewers who ask to share and wait for the host's answer changed. */
  onRequests: (waiting: Participant[]) => void;
}

/**
 * Who is on the stage: the host's own share, or the share of one viewer whom the host allowed and
 * whose picture it passes on to the others. One picture at a time. The host decides: a viewer
 * only asks, and a share of the host's own takes the stage back.
 */
export class ShareCoordinator {
  private readonly log = createLogger('session.host');
  private shared: MediaStream | null = null;
  /** The viewer whose share the host allowed; set from the grant to the end of the share. */
  private sharerId: string | null = null;
  /** The sharer's picture, once its first track arrived and it is passed on. */
  private forwarded: IncomingShare | null = null;
  /** Viewers who asked to share, oldest first. */
  private readonly requests = new Set<string>();

  constructor(private readonly host: SharingHost) {}

  /** The stream the host currently shares, or `null`. */
  get sharedStream(): MediaStream | null {
    return this.shared;
  }

  /** A viewer's picture that the host shows and passes on, or `null`. */
  get incoming(): IncomingShare | null {
    return this.forwarded;
  }

  /** What goes out to the viewers: the host's own share, or the forwarded picture of a viewer. */
  get sending(): IncomingShare | null {
    return this.shared ? { sourceId: this.host.hostId(), stream: this.shared } : this.forwarded;
  }

  /** The viewers who asked to share and wait for an answer, oldest first. */
  get shareRequests(): Participant[] {
    const viewers = this.host.viewers();
    return [...this.requests].flatMap((id) => viewers.get(id)?.participant ?? []);
  }

  /** The links that get the picture: every viewer but the one who shares it. */
  sendingLinks(): Map<string, MediaLink> {
    if (!this.sending) return new Map();
    return new Map(
      [...this.host.viewers()]
        .filter(([id]) => id !== this.sharerId)
        .map(([id, { link }]) => [id, link] as const),
    );
  }

  /** Lets the viewer share. Another request that waits is answered `busy` at once. */
  allow(viewerId: string): void {
    const viewer = this.host.viewers().get(viewerId);
    if (!viewer || !this.requests.delete(viewerId)) return;
    if (this.sending || this.sharerId !== null) {
      this.answer(viewer, 'busy');
    } else {
      this.sharerId = viewerId;
      this.log.info('viewer share allowed');
      this.host.sendTo(viewer.link, { type: 'share-granted' });
      for (const other of [...this.requests]) this.deny(other, 'busy');
    }
    this.publishRequests();
  }

  /** Turns a request down. */
  decline(viewerId: string): void {
    if (this.requests.has(viewerId)) this.deny(viewerId, 'declined');
  }

  /** Ends the share of the viewer who shares, if any. The viewer is told. */
  revoke(): void {
    const viewer = this.sharerId === null ? undefined : this.host.viewers().get(this.sharerId);
    if (!viewer) return;
    this.log.info('viewer share revoked');
    this.end();
    this.host.sendTo(viewer.link, { type: 'share-revoked' });
  }

  /**
   * Shares a stream with every viewer, now and for viewers who join later. Replaces a running
   * share. A viewer's share ends and a request that waits is answered `busy`: the host decides
   * what is on the stage, and a viewer should not hold a capture for an answer that is clear.
   */
  start(stream: MediaStream): void {
    this.revoke();
    for (const id of [...this.requests]) this.deny(id, 'busy');
    this.shared = stream;
    const viewers = this.host.viewers();
    this.log.info('sharing started', { viewers: viewers.size });
    for (const { link } of viewers.values()) this.offerTo(link);
    this.host.load.start();
    this.host.onSharing(stream);
  }

  /**
   * Passes on tracks the shared stream gained or lost after the share started, such as the
   * sound taken from a tab. Viewers and the sharer's own picture are handled as in `start`.
   */
  refresh(): void {
    const stream = this.shared;
    if (!stream) return;
    for (const { link } of this.host.viewers().values()) {
      this.host.guardMedia(link, () => link.setOutgoing(stream));
    }
  }

  stop(): void {
    if (!this.shared) return;
    this.shared = null;
    this.log.info('sharing stopped');
    this.host.load.stop();
    this.host.load.reset();
    for (const { link } of this.host.viewers().values()) {
      this.unshare(link);
      this.host.sendTo(link, { type: 'media-stopped', sourceId: this.host.hostId() });
    }
    this.host.clearReports();
    this.host.onSharing(null);
    this.host.publishLoad();
  }

  /** The announcement goes first, so the viewer knows the offer that follows is a share. */
  offerTo(link: MediaLink): void {
    const sending = this.sending;
    // The sharer does not get its own picture back.
    if (!sending || link === this.host.viewers().get(this.sharerId ?? '')?.link) return;
    this.host.sendTo(link, { type: 'media-started', sourceId: sending.sourceId });
    this.host.guardMedia(link, () => link.setOutgoing(sending.stream));
  }

  /** A viewer asks to share. */
  handleRequest(sender: Participant): void {
    const viewer = this.host.viewers().get(sender.id);
    if (!viewer || this.requests.has(sender.id) || sender.id === this.sharerId) return;
    if (this.sending || this.sharerId !== null) {
      this.answer(viewer, 'busy');
      return;
    }
    this.requests.add(sender.id);
    this.log.info('viewer asks to share', { waiting: this.requests.size });
    this.publishRequests();
  }

  /** A viewer cancels its request or stops its share. */
  handleStop(sender: Participant): void {
    this.requests.delete(sender.id);
    if (sender.id === this.sharerId) this.end();
    this.publishRequests();
  }

  /** The allowed viewer's first track arrived, or another one: show it and pass it on. */
  handleViewerStream(viewerId: string, stream: MediaStream): void {
    if (viewerId !== this.sharerId) return;
    const viewers = this.host.viewers();
    if (this.forwarded) {
      // A later track (the sound): the links sync to the stream as it is now.
      for (const [id, { link }] of viewers) {
        if (id !== viewerId) this.host.guardMedia(link, () => link.setOutgoing(stream));
      }
      return;
    }
    this.forwarded = { sourceId: viewerId, stream };
    this.log.info('forwarding a viewer share', { viewers: viewers.size });
    for (const [id, { link }] of viewers) {
      if (id !== viewerId) this.offerTo(link);
    }
    this.host.load.start();
    this.host.onIncoming(this.forwarded);
    this.host.publishLoad();
  }

  /**
   * A viewer is about to leave the session, whether the host removed them or the connection
   * ended. Their share ends and their request is gone. Called before the viewer is taken out of
   * the roster; the caller then calls `publishRequests`.
   */
  viewerLeaving(viewerId: string): void {
    if (viewerId === this.sharerId) this.end();
    this.requests.delete(viewerId);
  }

  /** The session is over. */
  clear(): void {
    this.requests.clear();
  }

  publishRequests(): void {
    this.host.onRequests(this.shareRequests);
  }

  private deny(viewerId: string, reason: ShareDenial): void {
    this.requests.delete(viewerId);
    const viewer = this.host.viewers().get(viewerId);
    if (viewer) this.answer(viewer, reason);
    this.publishRequests();
  }

  private answer(viewer: SharingViewer, reason: ShareDenial): void {
    this.log.info('viewer share turned down', { reason });
    this.host.sendTo(viewer.link, { type: 'share-denied', reason });
  }

  /** The viewer's share is over, whatever ended it: stop passing it on and tell the others. */
  private end(): void {
    const sharerId = this.sharerId;
    if (sharerId === null) return;
    this.sharerId = null;
    const forwarded = this.forwarded;
    this.forwarded = null;
    if (!forwarded) return;
    this.log.info('viewer share ended');
    this.host.load.stop();
    this.host.load.reset();
    this.host.clearReports();
    for (const [id, { link }] of this.host.viewers()) {
      if (id === sharerId) continue;
      this.unshare(link);
      this.host.sendTo(link, { type: 'media-stopped', sourceId: sharerId });
    }
    this.host.onIncoming(null);
    this.host.publishLoad();
  }

  private unshare(link: MediaLink): void {
    this.host.guardMedia(link, () => link.setOutgoing(null));
  }
}
