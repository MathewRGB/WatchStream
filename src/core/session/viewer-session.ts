import { Emitter } from '../events/emitter';
import { decodeInvitation, encodeReply } from '../handshake/handshake-code';
import type { MessageLink, PeerConnector } from '../peer/message-link';
import {
  normalizeChatText,
  parseHostMessage,
  serialize,
  type ChatMessage,
  type Participant,
} from '../protocol/messages';
import { SessionError } from './session-error';

export type ViewerState = 'waiting-for-host' | 'connected' | 'disconnected';

export interface ViewerSessionEvents {
  state: ViewerState;
  roster: Participant[];
  chat: ChatMessage;
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

  private constructor(
    readonly hostName: string,
    private readonly link: MessageLink,
  ) {
    link.events.on('open', () => this.setState('connected'));
    link.events.on('close', () => this.setState('disconnected'));
    link.events.on('message', (raw) => this.handleMessage(raw));
  }

  /**
   * Accepts an invitation code. The returned reply code has to reach the
   * host; the session connects once the host has applied it.
   */
  static async join(
    invitationCode: string,
    options: JoinOptions,
  ): Promise<{ session: ViewerSession; replyCode: string }> {
    const invitation = await decodeInvitation(invitationCode);
    const { link, sdp } = await options.connector.acceptOffer(invitation.sdp);
    const replyCode = await encodeReply({
      inviteId: invitation.inviteId,
      viewerName: options.viewerName,
      sdp,
    });
    return { session: new ViewerSession(invitation.hostName, link), replyCode };
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
    }
  }

  private setState(state: ViewerState): void {
    if (this.currentState === state || this.currentState === 'disconnected') return;
    this.currentState = state;
    this.emitter.emit('state', state);
  }
}
