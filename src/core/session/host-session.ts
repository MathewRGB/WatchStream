import { Emitter } from '../events/emitter';
import { DEFAULT_QUALITY, qualityPreset, type QualityId } from '../media/quality';
import { decodeReply, encodeInvitation } from '../handshake/handshake-code';
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
  maxViewers?: number;
  /** How long to wait for the connection after a reply was accepted. */
  connectTimeoutMs?: number;
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
}

interface Viewer {
  participant: Participant;
  link: MediaLink;
}

export const DEFAULT_MAX_VIEWERS = 3;
const DEFAULT_CONNECT_TIMEOUT_MS = 20_000;

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
  private readonly maxViewers: number;
  private readonly connectTimeoutMs: number;
  private readonly createId: () => string;
  private readonly now: () => number;
  private shared: MediaStream | null = null;
  private currentQuality: QualityId = DEFAULT_QUALITY;

  constructor(private readonly options: HostSessionOptions) {
    this.maxViewers = options.maxViewers ?? DEFAULT_MAX_VIEWERS;
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
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
  async createInvitation(): Promise<{ inviteId: string; code: string }> {
    if (this.openSlots <= 0) {
      throw new SessionError('session-full', `A session holds at most ${this.maxViewers} viewers.`);
    }
    const inviteId = this.createId();
    const { link, sdp } = await this.options.connector.createOffer();
    this.pending.set(inviteId, link);
    this.publishSlots();
    const code = await encodeInvitation({ inviteId, hostName: this.options.hostName, sdp });
    return { inviteId, code };
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
      link.close();
      this.connecting.delete(link);
      this.publishSlots();
      throw error instanceof SessionError
        ? error
        : new SessionError('connection-failed', 'The reply could not be applied.');
    }

    this.addViewer({ participant, link });
    return participant;
  }

  sendChat(text: string): void {
    this.publishChat(this.self, text);
  }

  get quality(): QualityId {
    return this.currentQuality;
  }

  /** Sets how much of the picture goes out; takes effect at once and for later viewers. */
  setQuality(id: QualityId): void {
    this.currentQuality = id;
    for (const { link } of this.viewers.values()) this.applyQuality(link);
  }

  /** The stream the host currently shares, or `null`. */
  get sharedStream(): MediaStream | null {
    return this.shared;
  }

  /** Shares a stream with every viewer, now and for viewers who join later. Replaces a running share. */
  startSharing(stream: MediaStream): void {
    this.shared = stream;
    for (const { link } of this.viewers.values()) this.startSharingWith(link);
    this.emitter.emit('sharing', stream);
  }

  stopSharing(): void {
    if (!this.shared) return;
    this.shared = null;
    for (const { link } of this.viewers.values()) {
      this.unshareWith(link);
      this.sendTo(link, { type: 'media-stopped', sourceId: this.hostId });
    }
    this.emitter.emit('sharing', null);
  }

  close(): void {
    for (const link of this.pending.values()) link.close();
    for (const link of this.connecting) link.close();
    for (const { link } of this.viewers.values()) link.close();
    this.pending.clear();
    this.connecting.clear();
    this.viewers.clear();
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
        this.publishRoster();
        this.publishSlots();
      }
    });
    this.sendTo(link, { type: 'welcome', participantId: participant.id });
    // The link keeps the limits and applies them whenever a video track gets negotiated.
    this.applyQuality(link);
    if (this.shared) this.startSharingWith(link);
    this.publishRoster();
    this.publishSlots();
  }

  private handleViewerMessage(link: MediaLink, raw: string, sender: Participant): void {
    const message = parseViewerMessage(raw);
    if (message?.type === 'chat') {
      this.publishChat(sender, message.text);
    } else if (message?.type === 'media-answer' && message.sourceId === this.hostId) {
      void link.receiveSignal({ type: 'answer', sdp: message.sdp }).catch(() => link.close());
    }
  }

  /** The announcement goes first, so the viewer knows the offer that follows is a share. */
  private startSharingWith(link: MediaLink): void {
    this.sendTo(link, { type: 'media-started', sourceId: this.hostId });
    this.guardMedia(link, () => link.setOutgoing(this.shared));
  }

  private applyQuality(link: MediaLink): void {
    // Limits are cosmetic for the viewer: failing to set them must not drop anyone.
    void link.setVideoLimits(qualityPreset(this.currentQuality)).catch(() => {});
  }

  private unshareWith(link: MediaLink): void {
    this.guardMedia(link, () => link.setOutgoing(null));
  }

  /** Media trouble with one viewer must not affect the others; that viewer drops out. */
  private guardMedia(link: MediaLink, action: () => void): void {
    try {
      action();
    } catch {
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
    } catch {
      link.close();
    }
  }

  private waitUntilOpen(link: MediaLink): Promise<void> {
    if (link.state === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const fail = () => {
        cleanup();
        reject(
          new SessionError(
            'connection-failed',
            'No direct connection could be established with this viewer.',
          ),
        );
      };
      const timer = setTimeout(fail, this.connectTimeoutMs);
      const offOpen = link.events.on('open', () => {
        cleanup();
        resolve();
      });
      const offClose = link.events.on('close', fail);
      const cleanup = () => {
        clearTimeout(timer);
        offOpen();
        offClose();
      };
    });
  }
}
