import { Emitter } from '../events/emitter';
import { createLogger, describeThrown } from '../log/logger';
import { LoadMonitor, type LinkHealth } from '../media/load-monitor';
import {
  DEFAULT_QUALITY,
  lowerQuality,
  qualityPreset,
  stepsBelow,
  type QualityId,
} from '../media/quality';
import { decodeReply, encodeInvitation } from '../handshake/handshake-code';
import { summarizeCandidates, type CandidateSummary } from '../peer/candidates';
import { describeDiagnostics } from '../peer/diagnostics';
import type { LinkStats } from '../peer/link-stats';
import type { MediaLink, OfferingLink, PeerConnector } from '../peer/message-link';
import {
  normalizeChatText,
  parseViewerMessage,
  serialize,
  type ChatMessage,
  type HostMessage,
  type Participant,
} from '../protocol/messages';
import { SessionError } from './session-error';

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

/** How well the host carries its viewers (ADR-0006). */
export interface LoadStatus {
  /** What the host chose; the most that is sent. */
  chosen: QualityId;
  /** What is sent now: the chosen step, lowered when the host cannot keep up. */
  effective: QualityId;
  viewers: number;
  /** Why the quality is lowered; `null` while it is not. */
  cause: 'computer' | 'connection' | null;
  /** The host struggles at the lowest step: nothing more can be done. */
  overloaded: boolean;
  /** By participant id; a viewer who is not listed is not known to be slow. */
  health: ReadonlyMap<string, LinkHealth>;
}

export interface HostSessionEvents {
  roster: Participant[];
  /** The number of free places changed (payload: the new number). */
  slots: number;
  chat: ChatMessage;
  /** The host started (stream) or stopped (`null`) sharing. */
  sharing: MediaStream | null;
  /** The picture quality the host chose changed (payload: the new preset). */
  quality: QualityId;
  /** The load status changed: the effective quality, the cause, how the viewers fare. */
  load: LoadStatus;
}

interface Viewer {
  participant: Participant;
  link: MediaLink;
}

/**
 * The most viewers a session holds (ADR-0006). A ceiling in the code and no setting: what a host's
 * computer and connection carry is for the load monitor to find out, and with many viewers some
 * of them may get the picture late or at a lower quality.
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
  /** Links of removed viewers, open for a moment longer; see `removeViewer`. */
  private readonly leaving = new Map<MediaLink, ReturnType<typeof setTimeout>>();
  private readonly maxViewers: number;
  private readonly connectTimeoutMs: number;
  private readonly createId: () => string;
  private readonly now: () => number;
  private readonly log = createLogger('session.host');
  private shared: MediaStream | null = null;
  private currentQuality: QualityId = DEFAULT_QUALITY;
  private readonly monitor = new LoadMonitor();
  private readonly monitorIntervalMs: number;
  private monitorTimer: ReturnType<typeof setInterval> | null = null;
  private reading = false;
  /** Steps the load monitor has taken off the quality the host chose. */
  private penalty = 0;
  private lowerCause: 'computer' | 'connection' = 'computer';
  private overloaded = false;
  private health = new Map<string, LinkHealth>();
  private lastLoadKey = '';

  constructor(private readonly options: HostSessionOptions) {
    this.maxViewers = Math.min(options.maxViewers ?? MAX_VIEWERS, MAX_VIEWERS);
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
    this.monitorIntervalMs = options.monitorIntervalMs ?? DEFAULT_MONITOR_INTERVAL_MS;
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
    return this.maxViewers - this.viewers.size - this.pending.size - this.connecting.size;
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
    const inviteId = this.createId();
    const { link, sdp } = await this.options.connector.createOffer();
    this.pending.set(inviteId, link);
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

  /** Applies a viewer's reply code and resolves once the viewer has joined. */
  async acceptReply(code: string): Promise<Participant> {
    const reply = await decodeReply(code);
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

  /** The quality the host chose: the most that is sent. */
  get quality(): QualityId {
    return this.currentQuality;
  }

  /** What is sent now: the chosen quality, lowered while the host cannot keep up. */
  get effectiveQuality(): QualityId {
    return lowerQuality(this.currentQuality, this.penalty);
  }

  get load(): LoadStatus {
    return {
      chosen: this.currentQuality,
      effective: this.effectiveQuality,
      viewers: this.viewers.size,
      cause: this.penalty > 0 || this.overloaded ? this.lowerCause : null,
      overloaded: this.overloaded,
      health: this.health,
    };
  }

  /**
   * Sets the most that goes out, at once and for later viewers. A new choice starts the load
   * monitor over: what it learned was about the old one.
   */
  setQuality(id: QualityId): void {
    this.currentQuality = id;
    this.resetLoad();
    for (const { link } of this.viewers.values()) this.applyQuality(link);
    this.emitter.emit('quality', id);
    this.publishLoad();
  }

  /** The stream the host currently shares, or `null`. */
  get sharedStream(): MediaStream | null {
    return this.shared;
  }

  /** Shares a stream with every viewer, now and for viewers who join later. Replaces a running share. */
  startSharing(stream: MediaStream): void {
    this.shared = stream;
    this.log.info('sharing started', { viewers: this.viewers.size });
    for (const { link } of this.viewers.values()) this.startSharingWith(link);
    this.startMonitoring();
    this.emitter.emit('sharing', stream);
  }

  stopSharing(): void {
    if (!this.shared) return;
    this.shared = null;
    this.log.info('sharing stopped');
    this.stopMonitoring();
    this.resetLoad();
    for (const { link } of this.viewers.values()) {
      this.unshareWith(link);
      this.sendTo(link, { type: 'media-stopped', sourceId: this.hostId });
    }
    this.emitter.emit('sharing', null);
    this.publishLoad();
  }

  /**
   * Removes a viewer from the session (a host's call, ADR-0006). The viewer is told, and the
   * connection closes a moment later so that the message gets out first. The place is free at
   * once, and nothing the viewer sends in that moment is heard.
   */
  removeViewer(id: string): void {
    const viewer = this.viewers.get(id);
    if (!viewer) return;
    this.viewers.delete(id);
    this.monitor.forget(id);
    this.health.delete(id);
    this.log.info('viewer removed', { viewers: this.viewers.size });
    this.sendTo(viewer.link, { type: 'removed' });
    this.leaving.set(
      viewer.link,
      setTimeout(() => {
        this.leaving.delete(viewer.link);
        viewer.link.close();
      }, REMOVED_GRACE_MS),
    );
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
  }

  close(): void {
    this.stopMonitoring();
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
      }
    });
    link.events.on('close', () => {
      if (this.viewers.delete(participant.id)) {
        this.log.info('viewer left', { viewers: this.viewers.size });
        this.monitor.forget(participant.id);
        this.health.delete(participant.id);
        this.publishRoster();
        this.publishSlots();
        this.publishLoad();
      }
    });
    this.log.info('viewer joined', { viewers: this.viewers.size });
    this.sendTo(link, { type: 'welcome', participantId: participant.id });
    // The link keeps the limits and applies them whenever a video track gets negotiated.
    this.applyQuality(link);
    if (this.shared) this.startSharingWith(link);
    this.publishRoster();
    this.publishSlots();
    this.publishLoad();
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
    } else {
      // Dropped without a reply, as the protocol says; the length helps tell junk from a bug.
      this.log.debug('dropped a message from a viewer', { length: raw.length });
    }
  }

  /** The announcement goes first, so the viewer knows the offer that follows is a share. */
  private startSharingWith(link: MediaLink): void {
    this.sendTo(link, { type: 'media-started', sourceId: this.hostId });
    this.guardMedia(link, () => link.setOutgoing(this.shared));
  }

  private applyQuality(link: MediaLink): void {
    // Limits are cosmetic for the viewer: failing to set them must not drop anyone.
    void link.setMediaLimits(qualityPreset(this.effectiveQuality)).catch((error) => {
      this.log.warn('could not set the video limits', describeThrown(error));
    });
  }

  /** The load monitor reads the links while something is shared (ADR-0006). */
  private startMonitoring(): void {
    if (this.monitorTimer !== null) return;
    this.monitorTimer = setInterval(() => void this.readLinks(), this.monitorIntervalMs);
  }

  private stopMonitoring(): void {
    if (this.monitorTimer !== null) clearInterval(this.monitorTimer);
    this.monitorTimer = null;
  }

  private resetLoad(): void {
    this.monitor.reset();
    this.penalty = 0;
    this.overloaded = false;
    this.health = new Map();
  }

  /** One round: read every link, let the monitor judge, and apply a changed quality to all. */
  private async readLinks(): Promise<void> {
    if (this.reading || !this.shared || this.viewers.size === 0) return;
    this.reading = true;
    try {
      const readings = new Map<string, LinkStats | null>();
      await Promise.all(
        [...this.viewers].map(async ([id, { link }]) => {
          readings.set(id, await link.stats().catch(() => null));
        }),
      );
      // Sharing may have stopped, or the quality been chosen again, while the links were read.
      if (!this.shared) return;
      const decision = this.monitor.update({
        readings,
        limits: qualityPreset(this.effectiveQuality),
        stepsAvailable: stepsBelow(this.currentQuality),
      });
      const before = this.penalty;
      this.penalty = decision.penalty;
      this.overloaded = decision.overloaded;
      this.health = new Map(decision.links);
      if (decision.struggling && decision.cause) this.lowerCause = decision.cause;
      if (this.penalty !== before) {
        this.log.info(this.penalty > before ? 'quality lowered' : 'quality raised', {
          to: this.effectiveQuality,
          viewers: this.viewers.size,
          cause: this.lowerCause,
        });
        for (const { link } of this.viewers.values()) this.applyQuality(link);
      }
      this.publishLoad();
    } finally {
      this.reading = false;
    }
  }

  /** Tells the listeners, but only when something they show has changed. */
  private publishLoad(): void {
    const status = this.load;
    const key = [
      status.effective,
      status.cause,
      status.overloaded,
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
