import { Emitter } from '../events/emitter';
import { createLogger, describeThrown } from '../log/logger';
import {
  changeCustomQuality,
  customFromPreset,
  DEFAULT_QUALITY,
  resolveLimits,
  type CustomQuality,
  type MediaLimits,
  type QualityChoice,
} from '../media/quality';
import { decodeReply, encodeInvitation, newInviteId } from '../handshake/handshake-code';
import { summarizeCandidates, type CandidateSummary } from '../peer/candidates';
import { describeDiagnostics } from '../peer/diagnostics';
import type { MediaLink, OfferingLink, PeerConnector } from '../peer/message-link';
import type { ReceiveReport } from '../peer/receive-stats';
import { DEFAULT_CODEC, type CodecId } from '../peer/video-codecs';
import {
  normalizeChatText,
  parseViewerMessage,
  serialize,
  type ChatMessage,
  type HostMessage,
  type Participant,
  type ShareDenial,
} from '../protocol/messages';
import { LoadControl, type LoadStatus } from './load-control';
import { SessionError } from './session-error';

export type { LoadStatus } from './load-control';

export interface HostSessionOptions {
  hostName: string;
  connector: PeerConnector;
  /** Fewer viewers than `MAX_VIEWERS`, for tests; more is not possible. */
  maxViewers?: number;
  /** How long to wait for the connection after a reply was accepted. */
  connectTimeoutMs?: number;
  /** How often the load monitor reads the links while the host shares. */
  monitorIntervalMs?: number;
  createId?: () => string;
  now?: () => number;
}

export interface HostSessionEvents {
  roster: Participant[];
  /** The number of free places changed (payload: the new number). */
  slots: number;
  chat: ChatMessage;
  /** The host started (stream) or stopped (`null`) sharing. */
  sharing: MediaStream | null;
  /** What the host chose for the picture and sound changed (payload: the new choice). */
  quality: QualityChoice;
  /** The video codec the host chose changed (payload: the new choice). */
  codec: CodecId;
  /** The load status changed: whether the host struggles, the cause, how the viewers fare. */
  load: LoadStatus;
  /** A viewer's share started (its picture) or ended (`null`); see `incoming`. */
  incoming: IncomingShare | null;
  /** The viewers who asked to share and wait for the host's answer. */
  shareRequests: Participant[];
  /** A viewer told how the picture arrives; see `receiveReports`. */
  receiveReports: ReadonlyMap<string, ReceiveReport>;
}

/** A viewer's share, as the host sees it: who, and the picture that arrives from them. */
export interface IncomingShare {
  sourceId: string;
  stream: MediaStream;
}

interface Viewer {
  participant: Participant;
  link: MediaLink;
}

/**
 * The most viewers a session holds. A ceiling in the code and no setting: what a host's
 * computer and connection carry is for the load monitor to find out, and with many viewers some
 * of them may get the picture late.
 */
export const MAX_VIEWERS = 12;
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;
const DEFAULT_MONITOR_INTERVAL_MS = 2_000;
/** How long a removed viewer's connection stays open, so that the message reaches them. */
const REMOVED_GRACE_MS = 300;

/**
 * The host side of a watch session. The host is authoritative: it decides who
 * is in the session and relays every chat message to all viewers.
 */
export class HostSession {
  readonly hostId: string;
  private readonly emitter = new Emitter<HostSessionEvents>();
  private readonly pending = new Map<string, OfferingLink>();
  /** Links whose reply was accepted but that are not open yet; they still hold a place. */
  private readonly connecting = new Set<MediaLink>();
  private readonly viewers = new Map<string, Viewer>();
  /** The latest report of each viewer on how the picture arrives; gone with the picture. */
  private reports = new Map<string, ReceiveReport>();
  /** Invitations whose connection is being made; they already hold a place. */
  private making = 0;
  /** Links of removed viewers, open for a moment longer; see `removeViewer`. */
  private readonly leaving = new Map<MediaLink, ReturnType<typeof setTimeout>>();
  private readonly maxViewers: number;
  private readonly connectTimeoutMs: number;
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly log = createLogger('session.host');
  private shared: MediaStream | null = null;
  /** The viewer whose share the host allowed; set from the grant to the end of the share. */
  private sharerId: string | null = null;
  /** The sharer's picture, once its first track arrived and it is passed on. */
  private forwarded: IncomingShare | null = null;
  /** Viewers who asked to share, oldest first. */
  private readonly requests = new Set<string>();
  private currentQuality: QualityChoice = DEFAULT_QUALITY;
  private currentCustom: CustomQuality = customFromPreset(DEFAULT_QUALITY);
  /** Whether the host has set a custom value; until then `custom` starts from the step in use. */
  private customTouched = false;
  private currentCodec: CodecId = DEFAULT_CODEC;
  private readonly loadControl: LoadControl;
  private lastLoadKey = '';

  constructor(private readonly options: HostSessionOptions) {
    this.maxViewers = Math.min(options.maxViewers ?? MAX_VIEWERS, MAX_VIEWERS);
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.loadControl = new LoadControl({
      intervalMs: options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS,
      chosen: () => this.currentQuality,
      limits: () => this.limits,
      links: () => this.sendingLinks(),
      onReading: () => this.publishLoad(),
    });
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
    this.hostId = this.createId();
  }

  get events(): Pick<Emitter<HostSessionEvents>, 'on'> {
    return this.emitter;
  }

  get participants(): Participant[] {
    return [this.self, ...[...this.viewers.values()].map((viewer) => viewer.participant)];
  }

  private get self(): Participant {
    return { id: this.hostId, name: this.options.hostName, role: 'host' };
  }

  get openSlots(): number {
    return (
      this.maxViewers - this.viewers.size - this.pending.size - this.connecting.size - this.making
    );
  }

  /** Creates a single-use invitation code for one viewer. */
  async createInvitation(): Promise<{
    inviteId: string;
    code: string;
    candidates: CandidateSummary;
  }> {
    if (this.openSlots <= 0) {
      throw new SessionError('session-full', `A session holds at most ${this.maxViewers} viewers.`);
    }
    const inviteId = newInviteId();
    // Making the connection takes a moment. The place is held meanwhile, or several invitations
    // asked for at once would all pass the check above and fill more places than there are.
    this.making += 1;
    let made: Awaited<ReturnType<PeerConnector['createOffer']>>;
    try {
      made = await this.options.connector.createOffer();
      this.pending.set(inviteId, made.link);
    } finally {
      this.making -= 1;
    }
    const { sdp } = made;
    const candidates = summarizeCandidates(sdp);
    this.log.info('invitation created', { openSlots: this.openSlots, ...candidates });
    this.publishSlots();
    const code = await encodeInvitation({ inviteId, hostName: this.options.hostName, sdp });
    return { inviteId, code, candidates };
  }

  cancelInvitation(inviteId: string): void {
    const link = this.pending.get(inviteId);
    if (!link) return;
    link.close();
    this.pending.delete(inviteId);
    this.publishSlots();
  }

  /**
   * Applies a viewer's reply code and resolves once the viewer has joined. With `inviteId`, a
   * reply to another invitation is refused before anything happens, so that a code pasted into
   * the wrong card neither connects someone else nor leaves that card's invitation behind.
   */
  async acceptReply(code: string, inviteId?: string): Promise<Participant> {
    const reply = await decodeReply(code);
    if (inviteId !== undefined && reply.inviteId !== inviteId && this.pending.has(reply.inviteId)) {
      throw new SessionError(
        'wrong-invitation',
        'This reply belongs to another invitation of this session.',
      );
    }
    const link = this.pending.get(reply.inviteId);
    if (!link) {
      throw new SessionError(
        'unknown-invitation',
        'This reply does not belong to an open invitation of this session.',
      );
    }
    this.pending.delete(reply.inviteId);
    this.connecting.add(link);
    const participant: Participant = {
      id: this.createId(),
      name: reply.viewerName,
      role: 'viewer',
    };

    try {
      await link.acceptAnswer(reply.sdp);
      await this.waitUntilOpen(link);
    } catch (error) {
      // Read the state before closing: afterwards it only says "closed".
      const details = describeDiagnostics(link.diagnostics());
      const failure =
        error instanceof SessionError
          ? error
          : new SessionError('connection-failed', 'The reply could not be applied.');
      this.log.warn('viewer did not connect', {
        reason: failure.reason,
        ...(failure === error ? {} : describeThrown(error)),
      });
      link.close();
      this.connecting.delete(link);
      this.publishSlots();
      throw new SessionError(failure.reason, failure.message, details);
    }

    this.addViewer({ participant, link });
    return participant;
  }

  sendChat(text: string): void {
    this.publishChat(this.self, text);
  }

  /** What the host chose: a step, or `custom`. */
  get quality(): QualityChoice {
    return this.currentQuality;
  }

  /** The values of the custom choice; they count only while `quality` is `custom`. */
  get customQuality(): CustomQuality {
    return this.currentCustom;
  }

  /** What is sent: the limits the choice comes to. */
  get limits(): MediaLimits {
    return resolveLimits(this.currentQuality, this.currentCustom);
  }

  /** How the picture arrives at each viewer, as the viewers say; empty while nothing is shared. */
  get receiveReports(): ReadonlyMap<string, ReceiveReport> {
    return this.reports;
  }

  get load(): LoadStatus {
    return this.loadControl.status(this.viewers.size);
  }

  /**
   * Sets the quality that goes out, at once and for later viewers. A new choice starts the load
   * monitor over: what it learned was about the old one. Choosing `custom` for the first time
   * starts from the step that was in use, so fine-tuning begins where the host was.
   */
  setQuality(choice: QualityChoice): void {
    if (choice === 'custom' && !this.customTouched && this.currentQuality !== 'custom') {
      this.currentCustom = customFromPreset(this.currentQuality);
    }
    this.currentQuality = choice;
    this.applyChosenQuality();
  }

  /**
   * Sets values of the custom choice and chooses it. Each value is put on the list it belongs to
   * (see `changeCustomQuality`).
   */
  setCustomQuality(changes: Partial<CustomQuality>): void {
    if (!this.customTouched && this.currentQuality !== 'custom') {
      this.currentCustom = customFromPreset(this.currentQuality);
    }
    this.customTouched = true;
    this.currentCustom = changeCustomQuality(this.currentCustom, changes);
    this.currentQuality = 'custom';
    this.applyChosenQuality();
  }

  private applyChosenQuality(): void {
    this.loadControl.reset();
    for (const { link } of this.viewers.values()) this.applyQuality(link);
    this.emitter.emit('quality', this.currentQuality);
    this.publishLoad();
  }

  /** The video codec the host chose; it is offered first, with the others behind it. */
  get codec(): CodecId {
    return this.currentCodec;
  }

  /**
   * Sets the codec that is offered first, at once and for later viewers. While a picture is sent
   * the links negotiate again; the load monitor starts over, because what it learned was about the
   * old codec.
   */
  setCodec(id: CodecId): void {
    if (id === this.currentCodec) return;
    this.currentCodec = id;
    this.loadControl.reset();
    for (const { link } of this.viewers.values()) this.applyCodec(link);
    this.emitter.emit('codec', id);
    this.publishLoad();
  }

  /** The stream the host currently shares, or `null`. */
  get sharedStream(): MediaStream | null {
    return this.shared;
  }

  /** A viewer's picture that the host shows and passes on, or `null`. */
  get incoming(): IncomingShare | null {
    return this.forwarded;
  }

  /** The viewers who asked to share and wait for an answer, oldest first. */
  get shareRequests(): Participant[] {
    return [...this.requests].flatMap((id) => this.viewers.get(id)?.participant ?? []);
  }

  /** Lets the viewer share. Another request that waits is answered `busy` at once. */
  allowShare(viewerId: string): void {
    const viewer = this.viewers.get(viewerId);
    if (!viewer || !this.requests.delete(viewerId)) return;
    if (this.sending || this.sharerId !== null) {
      this.answerShare(viewer, 'busy');
    } else {
      this.sharerId = viewerId;
      this.log.info('viewer share allowed');
      this.sendTo(viewer.link, { type: 'share-granted' });
      for (const other of [...this.requests]) this.denyShare(other, 'busy');
    }
    this.publishRequests();
  }

  /** Turns a request down. */
  declineShare(viewerId: string): void {
    if (this.requests.has(viewerId)) this.denyShare(viewerId, 'declined');
  }

  /** Ends the share of the viewer who shares, if any. The viewer is told. */
  revokeShare(): void {
    const viewer = this.sharerId === null ? undefined : this.viewers.get(this.sharerId);
    if (!viewer) return;
    this.log.info('viewer share revoked');
    this.endIncoming();
    this.sendTo(viewer.link, { type: 'share-revoked' });
  }

  /**
   * Shares a stream with every viewer, now and for viewers who join later. Replaces a running
   * share. A viewer's share ends: the host decides what is on the stage.
   */
  startSharing(stream: MediaStream): void {
    this.revokeShare();
    this.shared = stream;
    this.log.info('sharing started', { viewers: this.viewers.size });
    for (const { link } of this.viewers.values()) this.startSharingWith(link);
    this.loadControl.start();
    this.emitter.emit('sharing', stream);
  }

  /**
   * Passes on tracks the shared stream gained or lost after the share started, such as the
   * sound taken from a tab. Viewers and the sharer's own picture are handled as in `startSharing`.
   */
  refreshSharing(): void {
    const stream = this.shared;
    if (!stream) return;
    for (const { link } of this.viewers.values())
      this.guardMedia(link, () => link.setOutgoing(stream));
  }

  stopSharing(): void {
    if (!this.shared) return;
    this.shared = null;
    this.log.info('sharing stopped');
    this.loadControl.stop();
    this.loadControl.reset();
    for (const { link } of this.viewers.values()) {
      this.unshareWith(link);
      this.sendTo(link, { type: 'media-stopped', sourceId: this.hostId });
    }
    this.clearReports();
    this.emitter.emit('sharing', null);
    this.publishLoad();
  }

  /**
   * Removes a viewer from the session (a host's call). The viewer is told, and the
   * connection closes a moment later so that the message gets out first. The place is free at
   * once, and nothing the viewer sends in that moment is heard.
   */
  removeViewer(id: string): void {
    const viewer = this.viewers.get(id);
    if (!viewer) return;
    this.dropViewer(id, 'viewer removed');
    this.sendTo(viewer.link, { type: 'removed' });
    this.leaving.set(
      viewer.link,
      setTimeout(() => {
        this.leaving.delete(viewer.link);
        viewer.link.close();
      }, REMOVED_GRACE_MS),
    );
  }

  close(): void {
    this.loadControl.stop();
    for (const link of this.pending.values()) link.close();
    for (const link of this.connecting) link.close();
    for (const { link } of this.viewers.values()) link.close();
    for (const [link, timer] of this.leaving) {
      clearTimeout(timer);
      link.close();
    }
    this.pending.clear();
    this.connecting.clear();
    this.viewers.clear();
    this.requests.clear();
    this.leaving.clear();
    this.emitter.clear();
  }

  private addViewer(viewer: Viewer): void {
    const { participant, link } = viewer;
    // The place changes hands in one step, so nobody ever sees it as free.
    this.connecting.delete(link);
    this.viewers.set(participant.id, viewer);
    link.events.on('message', (raw) => this.handleViewerMessage(link, raw, participant));
    link.events.on('signal', (signal) => {
      if (signal.type === 'offer') {
        this.sendTo(link, { type: 'media-offer', sourceId: this.hostId, sdp: signal.sdp });
      } else {
        // The answer to the viewer's own offer; `sourceId` names who made the offer.
        this.sendTo(link, { type: 'media-answer', sourceId: participant.id, sdp: signal.sdp });
      }
    });
    link.events.on('stream', (stream) => this.handleViewerStream(participant.id, stream));
    link.events.on('close', () => {
      if (this.viewers.get(participant.id) === viewer)
        this.dropViewer(participant.id, 'viewer left');
    });
    this.log.info('viewer joined', { viewers: this.viewers.size });
    this.sendTo(link, { type: 'welcome', participantId: participant.id });
    // The link keeps the limits and applies them whenever a video track gets negotiated.
    this.applyQuality(link);
    this.applyCodec(link);
    if (this.sending) this.startSharingWith(link);
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
  }

  /**
   * Takes a viewer out of the session, whether the host removed them or the connection ended, and
   * tells everyone what changed. Their share ends, their request is gone, their place is free.
   */
  private dropViewer(id: string, event: 'viewer removed' | 'viewer left'): void {
    if (id === this.sharerId) this.endIncoming();
    this.requests.delete(id);
    this.viewers.delete(id);
    this.loadControl.forget(id);
    this.setReport(id, null);
    this.log.info(event, { viewers: this.viewers.size });
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
    this.publishRequests();
  }

  private handleViewerMessage(link: MediaLink, raw: string, sender: Participant): void {
    if (!this.viewers.has(sender.id)) {
      // Removed a moment ago: the link is still open, but the viewer is not in the session.
      this.log.debug('dropped a message from a viewer who is gone', { length: raw.length });
      return;
    }
    const message = parseViewerMessage(raw);
    if (message?.type === 'chat') {
      this.publishChat(sender, message.text);
    } else if (message?.type === 'media-answer' && message.sourceId === this.hostId) {
      void link.receiveSignal({ type: 'answer', sdp: message.sdp }).catch((error) => {
        this.log.error('could not apply a media answer', describeThrown(error));
        link.close();
      });
    } else if (message?.type === 'media-offer' && message.sourceId === sender.id) {
      // Answered for every viewer, also after a share ended: the offer that takes the tracks away
      // has to be answered, or the link cannot negotiate again. Only the allowed viewer's picture
      // is passed on (`handleViewerStream`).
      void link.receiveSignal({ type: 'offer', sdp: message.sdp }).catch((error) => {
        this.log.error('could not apply a viewer media offer', describeThrown(error));
        link.close();
      });
    } else if (message?.type === 'receive-report') {
      // Only while a picture goes out: a late report must not outlive the share it was about.
      if (this.sending) this.setReport(sender.id, message.report);
    } else if (message?.type === 'share-request') {
      this.handleShareRequest(sender);
    } else if (message?.type === 'share-stop') {
      this.requests.delete(sender.id);
      if (sender.id === this.sharerId) this.endIncoming();
      this.publishRequests();
    } else {
      // Dropped without a reply, as the protocol says; the length helps tell junk from a bug.
      this.log.debug('dropped a message from a viewer', { length: raw.length });
    }
  }

  /** The announcement goes first, so the viewer knows the offer that follows is a share. */
  private startSharingWith(link: MediaLink): void {
    const sending = this.sending;
    // The sharer does not get its own picture back.
    if (!sending || link === this.viewers.get(this.sharerId ?? '')?.link) return;
    this.sendTo(link, { type: 'media-started', sourceId: sending.sourceId });
    this.guardMedia(link, () => link.setOutgoing(sending.stream));
  }

  /** What goes out to the viewers: the host's own share, or the forwarded picture of a viewer. */
  private get sending(): IncomingShare | null {
    return this.shared ? { sourceId: this.hostId, stream: this.shared } : this.forwarded;
  }

  private handleShareRequest(sender: Participant): void {
    const viewer = this.viewers.get(sender.id);
    if (!viewer || this.requests.has(sender.id) || sender.id === this.sharerId) return;
    if (this.sending || this.sharerId !== null) {
      this.answerShare(viewer, 'busy');
      return;
    }
    this.requests.add(sender.id);
    this.log.info('viewer asks to share', { waiting: this.requests.size });
    this.publishRequests();
  }

  private denyShare(viewerId: string, reason: ShareDenial): void {
    this.requests.delete(viewerId);
    const viewer = this.viewers.get(viewerId);
    if (viewer) this.answerShare(viewer, reason);
    this.publishRequests();
  }

  private answerShare(viewer: Viewer, reason: ShareDenial): void {
    this.log.info('viewer share turned down', { reason });
    this.sendTo(viewer.link, { type: 'share-denied', reason });
  }

  /** The allowed viewer's first track arrived, or another one: show it and pass it on. */
  private handleViewerStream(viewerId: string, stream: MediaStream): void {
    if (viewerId !== this.sharerId) return;
    if (this.forwarded) {
      // A later track (the sound): the links sync to the stream as it is now.
      for (const [id, { link }] of this.viewers) {
        if (id !== viewerId) this.guardMedia(link, () => link.setOutgoing(stream));
      }
      return;
    }
    this.forwarded = { sourceId: viewerId, stream };
    this.log.info('forwarding a viewer share', { viewers: this.viewers.size });
    for (const [id, { link }] of this.viewers) {
      if (id !== viewerId) this.startSharingWith(link);
    }
    this.loadControl.start();
    this.emitter.emit('incoming', this.forwarded);
    this.publishLoad();
  }

  /** The viewer's share is over, whatever ended it: stop passing it on and tell the others. */
  private endIncoming(): void {
    const sharerId = this.sharerId;
    if (sharerId === null) return;
    this.sharerId = null;
    const forwarded = this.forwarded;
    this.forwarded = null;
    if (!forwarded) return;
    this.log.info('viewer share ended');
    this.loadControl.stop();
    this.loadControl.reset();
    this.clearReports();
    for (const [id, { link }] of this.viewers) {
      if (id === sharerId) continue;
      this.unshareWith(link);
      this.sendTo(link, { type: 'media-stopped', sourceId: sharerId });
    }
    this.emitter.emit('incoming', null);
    this.publishLoad();
  }

  private publishRequests(): void {
    this.emitter.emit('shareRequests', this.shareRequests);
  }

  private applyQuality(link: MediaLink): void {
    // Limits are cosmetic for the viewer: failing to set them must not drop anyone.
    void link.setMediaLimits(this.limits).catch((error) => {
      this.log.warn('could not set the video limits', describeThrown(error));
    });
  }

  private applyCodec(link: MediaLink): void {
    // Only an order: failing to set it leaves the browser's own, and no one is dropped.
    void link.setVideoCodec(this.currentCodec).catch((error) => {
      this.log.warn('could not set the video codec', describeThrown(error));
    });
  }

  /** The links that get the picture: every viewer but the one who shares it. */
  private sendingLinks(): Map<string, MediaLink> {
    if (!this.sending) return new Map();
    return new Map(
      [...this.viewers]
        .filter(([id]) => id !== this.sharerId)
        .map(([id, { link }]) => [id, link] as const),
    );
  }

  private clearReports(): void {
    if (this.reports.size === 0) return;
    this.reports = new Map();
    this.emitter.emit('receiveReports', this.reports);
  }

  private setReport(id: string, report: ReceiveReport | null): void {
    const next = new Map(this.reports);
    if (report) next.set(id, report);
    else if (!next.delete(id)) return;
    this.reports = next;
    this.emitter.emit('receiveReports', next);
  }

  /** Tells the listeners, but only when something they show has changed. */
  private publishLoad(): void {
    const status = this.load;
    const key = [
      status.chosen,
      JSON.stringify(status.limits),
      // Tenths of a Mbit/s: the line on the stage does not need to hear about every wobble.
      status.sendingBps === null ? 'none' : Math.round(status.sendingBps / 100_000),
      status.cause,
      status.struggling,
      status.viewers,
      [...status.health].map(([id, health]) => `${id}:${health}`).join(','),
    ].join('|');
    if (key === this.lastLoadKey) return;
    this.lastLoadKey = key;
    this.emitter.emit('load', status);
  }

  private unshareWith(link: MediaLink): void {
    this.guardMedia(link, () => link.setOutgoing(null));
  }

  /** Media trouble with one viewer must not affect the others; that viewer drops out. */
  private guardMedia(link: MediaLink, action: () => void): void {
    try {
      action();
    } catch (error) {
      this.log.warn('dropped a viewer whose link failed during sharing', describeThrown(error));
      link.close();
    }
  }

  private publishChat(sender: Participant, text: string): void {
    const normalized = normalizeChatText(text);
    if (normalized === null) {
      throw new SessionError('invalid-message', 'Chat messages must not be empty or too long.');
    }
    const message: ChatMessage = {
      id: this.createId(),
      senderId: sender.id,
      senderName: sender.name,
      text: normalized,
      sentAt: this.now(),
    };
    this.broadcast({ type: 'chat', message });
    this.emitter.emit('chat', message);
  }

  private publishSlots(): void {
    this.emitter.emit('slots', this.openSlots);
  }

  private publishRoster(): void {
    const participants = this.participants;
    this.broadcast({ type: 'roster', participants });
    this.emitter.emit('roster', participants);
  }

  private broadcast(message: HostMessage): void {
    for (const { link } of this.viewers.values()) this.sendTo(link, message);
  }

  /** A failing link must never keep the others from receiving; it is closed and drops out. */
  private sendTo(link: MediaLink, message: HostMessage): void {
    if (link.state !== 'open') return;
    try {
      link.send(serialize(message));
    } catch (error) {
      this.log.warn('dropped a viewer whose link failed during sending', {
        type: message.type,
        ...describeThrown(error),
      });
      link.close();
    }
  }

  private waitUntilOpen(link: MediaLink): Promise<void> {
    if (link.state === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const fail = (cause: 'timeout' | 'closed') => () => {
        this.log.warn('viewer link did not open', { cause, afterMs: this.connectTimeoutMs });
        cleanup();
        reject(
          new SessionError(
            'connection-failed',
            'No direct connection could be established with this viewer.',
          ),
        );
      };
      const timer = setTimeout(fail('timeout'), this.connectTimeoutMs);
      const offOpen = link.events.on('open', () => {
        cleanup();
        resolve();
      });
      const offClose = link.events.on('close', fail('closed'));
      const cleanup = () => {
        clearTimeout(timer);
        offOpen();
        offClose();
      };
    });
  }
}
