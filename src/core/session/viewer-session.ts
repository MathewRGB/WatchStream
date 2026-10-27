import { Emitter } from '../events/emitter';
import { decodeInvitation, encodeReply } from '../handshake/handshake-code';
import { summarizeCandidates, type CandidateSummary } from '../peer/candidates';
import type { MediaLink, PeerConnector } from '../peer/message-link';
import {
  normalizeChatText,
  parseHostMessage,
  serialize,
  type ChatMessage,
  type Participant,
} from '../protocol/messages';
import { SessionError } from './session-error';

export type ViewerState = 'waiting-for-host' | 'connected' | 'disconnected';

/** What the host shares right now. */
export interface SharedMedia {
  /** The participant who shares. */
  sourceId: string;
  stream: MediaStream;
}

export interface ViewerSessionEvents {
  state: ViewerState;
  roster: Participant[];
  chat: ChatMessage;
  /** The shared picture started or changed; `null` once the share ended. */
  media: SharedMedia | null;
}

export interface JoinOptions {
  viewerName: string;
  connector: PeerConnector;
}

/** The viewer side of a watch session. It follows whatever the host sends. */
export class ViewerSession {
  private readonly emitter = new Emitter<ViewerSessionEvents>();
  private currentState: ViewerState = 'waiting-for-host';
  private ownId: string | null = null;
  private roster: Participant[] = [];
  private currentMedia: SharedMedia | null = null;
  /** Who the media in the running negotiation comes from; answers carry it back. */
  private offeredBy: string | null = null;
  /** Who announced a share that has not ended; media is shown only while this is set. */
  private sharer: string | null = null;

  private constructor(
    readonly hostName: string,
    private readonly link: MediaLink,
  ) {
    link.events.on('open', () => this.setState('connected'));
    link.events.on('close', () => this.setState('disconnected'));
    link.events.on('message', (raw) => this.handleMessage(raw));
    link.events.on('signal', (signal) => {
      if (signal.type === 'answer' && this.offeredBy !== null && this.link.state === 'open') {
        this.link.send(
          serialize({ type: 'media-answer', sourceId: this.offeredBy, sdp: signal.sdp }),
        );
      }
    });
    link.events.on('stream', (stream) => {
      if (this.sharer === null || stream === this.currentMedia?.stream) return;
      this.currentMedia = { sourceId: this.sharer, stream };
      this.emitter.emit('media', this.currentMedia);
    });
  }

  /**
   * Accepts an invitation code. The returned reply code has to reach the
   * host; the session connects once the host has applied it.
   */
  static async join(
    invitationCode: string,
    options: JoinOptions,
  ): Promise<{ session: ViewerSession; replyCode: string; candidates: CandidateSummary }> {
    const invitation = await decodeInvitation(invitationCode);
    const { link, sdp } = await options.connector.acceptOffer(invitation.sdp);
    const replyCode = await encodeReply({
      inviteId: invitation.inviteId,
      viewerName: options.viewerName,
      sdp,
    });
    return {
      session: new ViewerSession(invitation.hostName, link),
      replyCode,
      candidates: summarizeCandidates(sdp),
    };
  }

  get events(): Pick<Emitter<ViewerSessionEvents>, 'on'> {
    return this.emitter;
  }

  get state(): ViewerState {
    return this.currentState;
  }

  get participantId(): string | null {
    return this.ownId;
  }

  get participants(): Participant[] {
    return this.roster;
  }

  /** The shared picture, or `null` while nothing is shared. */
  get media(): SharedMedia | null {
    return this.currentMedia;
  }

  sendChat(text: string): void {
    const normalized = normalizeChatText(text);
    if (normalized === null) {
      throw new SessionError('invalid-message', 'Chat messages must not be empty or too long.');
    }
    if (this.link.state !== 'open') {
      throw new SessionError('not-connected', 'Not connected to the host.');
    }
    this.link.send(serialize({ type: 'chat', text: normalized }));
  }

  leave(): void {
    this.link.close();
    this.emitter.clear();
  }

  private handleMessage(raw: string): void {
    const message = parseHostMessage(raw);
    switch (message?.type) {
      case 'welcome':
        this.ownId = message.participantId;
        break;
      case 'roster':
        this.roster = message.participants;
        this.emitter.emit('roster', message.participants);
        break;
      case 'chat':
        this.emitter.emit('chat', message.message);
        break;
      case 'media-started':
        this.sharer = message.sourceId;
        break;
      case 'media-offer':
        this.offeredBy = message.sourceId;
        void this.link
          .receiveSignal({ type: 'offer', sdp: message.sdp })
          .catch(() => this.link.close());
        break;
      case 'media-stopped':
        if (this.sharer === message.sourceId) this.sharer = null;
        if (this.currentMedia?.sourceId === message.sourceId) {
          this.currentMedia = null;
          this.emitter.emit('media', null);
        }
        break;
    }
  }

  private setState(state: ViewerState): void {
    if (this.currentState === state || this.currentState === 'disconnected') return;
    this.currentState = state;
    this.emitter.emit('state', state);
  }
}
