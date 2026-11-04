import { Emitter } from '../events/emitter';
import { createLogger, describeThrown } from '../log/logger';
import { type CustomQuality, type MediaLimits, type QualityChoice } from '../media/quality';
import { decodeReply, encodeInvitation, newInviteId } from '../handshake/handshake-code';
import { summarizeCandidates, type CandidateSummary } from '../peer/candidates';
import { describeDiagnostics } from '../peer/diagnostics';
import type { LinkSignal, MediaLink, OfferingLink, PeerConnector } from '../peer/message-link';
import type { ReceiveReport } from '../peer/receive-stats';
import { detectAutoCodec, type CodecId } from '../peer/video-codecs';
import type { WeakLinkMode } from '../media/weak-link';
import {
  normalizeChatText,
  parseViewerMessage,
  serialize,
  type ChatMessage,
  type HostMessage,
  type Participant,
} from '../protocol/messages';
import { LoadControl, type LoadStatus } from './load-control';
import { MediaChoices } from './media-choices';
import { RateLimit } from './rate-limit';
import { ShareCoordinator, type IncomingShare } from './share-coordinator';
import { SessionError } from './session-error';

export type { LoadStatus } from './load-control';
export type { IncomingShare } from './share-coordinator';

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
  /** Asks what `auto` comes to on this computer; tests set it. Defaults to the browser's answer. */
  detectAutoCodec?: () => Promise<'h264' | 'vp9' | null>;
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
  /** What the sender gives up on a weak connection changed (payload: the new choice). */
  weakLink: WeakLinkMode;
  /** The load status changed: whether the host struggles, the cause, how the viewers fare. */
  load: LoadStatus;
  /** A viewer's share started (its picture) or ended (`null`); see `incoming`. */
  incoming: IncomingShare | null;
  /** The viewers who asked to share and wait for the host's answer. */
  shareRequests: Participant[];
  /** A viewer told how the picture arrives; see `receiveReports`. */
  receiveReports: ReadonlyMap<string, ReceiveReport>;
}

interface Viewer {
  participant: Participant;
  link: MediaLink;
  /** What this viewer may send as often as it likes is capped; see `RateLimit`. */
  chatLimit: RateLimit;
  reportLimit: RateLimit;
}

/** A person types a few lines in ten seconds, not more than this. */
const CHAT_LIMIT = { events: 10, windowMs: 10_000 };
/** A viewer reports every two seconds; this leaves room for several reports in a burst. */
const REPORT_LIMIT = { events: 30, windowMs: 10_000 };

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
  private ended = false;
  private readonly media = new MediaChoices();
  private readonly loadControl: LoadControl;
  private readonly sharing: ShareCoordinator;
  private lastLoadKey = '';

  constructor(private readonly options: HostSessionOptions) {
    this.maxViewers = Math.min(options.maxViewers ?? MAX_VIEWERS, MAX_VIEWERS);
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.loadControl = new LoadControl({
      intervalMs: options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS,
      chosen: () => this.media.quality,
      limits: () => this.limits,
      links: () => this.sharing.sendingLinks(),
      onReading: () => this.publishLoad(),
    });
    this.sharing = new ShareCoordinator({
      hostId: () => this.hostId,
      viewers: () => this.viewers,
      sendTo: (link, message) => this.sendTo(link, message),
      guardMedia: (link, action) => this.guardMedia(link, action),
      load: this.loadControl,
      clearReports: () => this.clearReports(),
      publishLoad: () => this.publishLoad(),
      onSharing: (stream) => this.emitter.emit('sharing', stream),
      onIncoming: (share) => this.emitter.emit('incoming', share),
      onRequests: (waiting) => this.emitter.emit('shareRequests', waiting),
    });
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.now = options.now ?? Date.now;
    this.hostId = this.createId();
    void (options.detectAutoCodec ?? detectAutoCodec)()
      .then((codec) => {
        if (!this.media.noteAutoCodec(codec)) return;
        this.log.info('automatic codec', { codec });
        if (this.media.codec === 'auto') {
          for (const { link } of this.viewers.values()) this.applyCodec(link);
        }
      })
      .catch(() => undefined);
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

  /** The session is over: `close` was called. */
  get closed(): boolean {
    return this.ended;
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
      if (this.ended) {
        made.link.close();
        throw new SessionError('not-connected', 'The session has ended.');
      }
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

    this.addViewer({
      participant,
      link,
      chatLimit: new RateLimit(CHAT_LIMIT.events, CHAT_LIMIT.windowMs),
      reportLimit: new RateLimit(REPORT_LIMIT.events, REPORT_LIMIT.windowMs),
    });
    return participant;
  }

  sendChat(text: string): void {
    this.publishChat(this.self, text);
  }

  /** What the host chose: a step, or `custom`. */
  get quality(): QualityChoice {
    return this.media.quality;
  }

  /** The values of the custom choice; they count only while `quality` is `custom`. */
  get customQuality(): CustomQuality {
    return this.media.customQuality;
  }

  /** What is sent: the limits the choice comes to. */
  get limits(): MediaLimits {
    return this.media.limits;
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
    this.media.setQuality(choice);
    this.applyChosenQuality();
  }

  /**
   * Sets values of the custom choice and chooses it. Each value is put on the list it belongs to
   * (see `changeCustomQuality`).
   */
  setCustomQuality(changes: Partial<CustomQuality>): void {
    this.media.setCustomQuality(changes);
    this.applyChosenQuality();
  }

  private applyChosenQuality(): void {
    this.loadControl.reset();
    for (const { link } of this.viewers.values()) this.applyQuality(link);
    this.emitter.emit('quality', this.media.quality);
    this.publishLoad();
  }

  /** The video codec the host chose; it is offered first, with the others behind it. */
  get codec(): CodecId {
    return this.media.codec;
  }

  /**
   * Sets the codec that is offered first, at once and for later viewers. While a picture is sent
   * the links negotiate again; the load monitor starts over, because what it learned was about the
   * old codec.
   */
  setCodec(id: CodecId): void {
    if (!this.media.setCodec(id)) return;
    this.loadControl.reset();
    for (const { link } of this.viewers.values()) this.applyCodec(link);
    this.emitter.emit('codec', id);
    this.publishLoad();
  }

  /** What the sender gives up when the connection to a viewer is too weak for the picture. */
  get weakLink(): WeakLinkMode {
    return this.media.weakLink;
  }

  setWeakLink(mode: WeakLinkMode): void {
    if (!this.media.setWeakLink(mode)) return;
    for (const { link } of this.viewers.values()) this.applyWeakLink(link);
    this.emitter.emit('weakLink', mode);
  }

  /** The stream the host currently shares, or `null`. */
  get sharedStream(): MediaStream | null {
    return this.sharing.sharedStream;
  }

  /** A viewer's picture that the host shows and passes on, or `null`. */
  get incoming(): IncomingShare | null {
    return this.sharing.incoming;
  }

  /** The viewers who asked to share and wait for an answer, oldest first. */
  get shareRequests(): Participant[] {
    return this.sharing.shareRequests;
  }

  /** Lets the viewer share. Another request that waits is answered `busy` at once. */
  allowShare(viewerId: string): void {
    this.sharing.allow(viewerId);
  }

  /** Turns a request down. */
  declineShare(viewerId: string): void {
    this.sharing.decline(viewerId);
  }

  /** Ends the share of the viewer who shares, if any. The viewer is told. */
  revokeShare(): void {
    this.sharing.revoke();
  }

  /**
   * Shares a stream with every viewer, now and for viewers who join later. Replaces a running
   * share and ends a viewer's share: the host decides what is on the stage.
   */
  startSharing(stream: MediaStream): void {
    this.sharing.start(stream);
  }

  /** Passes on tracks the shared stream gained or lost after the share started. */
  refreshSharing(): void {
    this.sharing.refresh();
  }

  stopSharing(): void {
    this.sharing.stop();
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
    this.ended = true;
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
    this.sharing.clear();
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
    link.events.on('stream', (stream) => this.sharing.handleViewerStream(participant.id, stream));
    link.events.on('close', () => {
      if (this.viewers.get(participant.id) === viewer)
        this.dropViewer(participant.id, 'viewer left');
    });
    this.log.info('viewer joined', { viewers: this.viewers.size });
    this.sendTo(link, { type: 'welcome', participantId: participant.id });
    // The link keeps the limits and applies them whenever a video track gets negotiated.
    this.applyQuality(link);
    this.applyCodec(link);
    this.applyWeakLink(link);
    this.sharing.offerTo(link);
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
  }

  /**
   * Takes a viewer out of the session, whether the host removed them or the connection ended, and
   * tells everyone what changed. Their share ends, their request is gone, their place is free.
   */
  private dropViewer(id: string, event: 'viewer removed' | 'viewer left'): void {
    this.sharing.viewerLeaving(id);
    this.viewers.delete(id);
    this.loadControl.forget(id);
    this.setReport(id, null);
    this.log.info(event, { viewers: this.viewers.size });
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
    this.sharing.publishRequests();
  }

  private handleViewerMessage(link: MediaLink, raw: string, sender: Participant): void {
    const viewer = this.viewers.get(sender.id);
    if (!viewer) {
      // Removed a moment ago: the link is still open, but the viewer is not in the session.
      this.log.debug('dropped a message from a viewer who is gone', { length: raw.length });
      return;
    }
    const message = parseViewerMessage(raw);
    switch (message?.type) {
      case 'chat':
        if (viewer.chatLimit.allow()) this.publishChat(sender, message.text);
        else this.log.warn('dropped a chat message: the viewer sends too many');
        break;
      case 'media-answer':
        if (message.sourceId === this.hostId) {
          this.applySignal(link, { type: 'answer', sdp: message.sdp });
        }
        break;
      case 'media-offer':
        // Answered for every viewer, also after a share ended: the offer that takes the tracks away
        // has to be answered, or the link cannot negotiate again. Only the allowed viewer's picture
        // is passed on (`handleViewerStream`).
        if (message.sourceId === sender.id) {
          this.applySignal(link, { type: 'offer', sdp: message.sdp });
        }
        break;
      case 'receive-report':
        // Only while a picture goes out: a late report must not outlive the share it was about.
        if (this.sharing.sending && viewer.reportLimit.allow())
          this.setReport(sender.id, message.report);
        break;
      case 'share-request':
        this.sharing.handleRequest(sender);
        break;
      case 'share-stop':
        this.sharing.handleStop(sender);
        break;
      default:
        // Dropped without a reply, as the protocol says; the length helps tell junk from a bug.
        this.log.debug('dropped a message from a viewer', { length: raw.length });
    }
  }

  /** A description that cannot be applied leaves the link unable to negotiate: it is closed. */
  private applySignal(link: MediaLink, signal: LinkSignal): void {
    void link.receiveSignal(signal).catch((error) => {
      this.log.error('could not apply a media description', {
        type: signal.type,
        ...describeThrown(error),
      });
      link.close();
    });
  }

  private applyQuality(link: MediaLink): void {
    // Limits are cosmetic for the viewer: failing to set them must not drop anyone.
    void link.setMediaLimits(this.limits).catch((error) => {
      this.log.warn('could not set the video limits', describeThrown(error));
    });
  }

  private applyCodec(link: MediaLink): void {
    // Only an order: failing to set it leaves the browser's own, and no one is dropped.
    void link.setVideoCodec(this.media.offeredCodec).catch((error) => {
      this.log.warn('could not set the video codec', describeThrown(error));
    });
  }

  private applyWeakLink(link: MediaLink): void {
    void link.setWeakLinkMode(this.media.weakLink).catch((error) => {
      this.log.warn('could not set the weak-link mode', describeThrown(error));
    });
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
