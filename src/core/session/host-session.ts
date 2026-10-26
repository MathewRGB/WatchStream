import { Emitter } from '../events/emitter';
import { decodeReply, encodeInvitation } from '../handshake/handshake-code';
import type { MessageLink, OfferingLink, PeerConnector } from '../peer/message-link';
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
}

interface Viewer {
  participant: Participant;
  link: MessageLink;
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
  private readonly connecting = new Set<MessageLink>();
  private readonly viewers = new Map<string, Viewer>();
  private readonly maxViewers: number;
  private readonly connectTimeoutMs: number;
  private readonly createId: () => string;
  private readonly now: () => number;

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
    link.events.on('message', (raw) => this.handleViewerMessage(participant, raw));
    link.events.on('close', () => {
      if (this.viewers.delete(participant.id)) {
        this.publishRoster();
        this.publishSlots();
      }
    });
    this.sendTo(link, { type: 'welcome', participantId: participant.id });
    this.publishRoster();
    this.publishSlots();
  }

  private handleViewerMessage(sender: Participant, raw: string): void {
    const message = parseViewerMessage(raw);
    if (message?.type === 'chat') {
      this.publishChat(sender, message.text);
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

  private sendTo(link: MessageLink, message: HostMessage): void {
    if (link.state === 'open') link.send(serialize(message));
  }

  private waitUntilOpen(link: MessageLink): Promise<void> {
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
