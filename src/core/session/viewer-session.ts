import { Emitter } from '../events/emitter';
import { createLogger, describeThrown } from '../log/logger';
import { decodeInvitation, encodeReply } from '../handshake/handshake-code';
import { summarizeCandidates, type CandidateSummary } from '../peer/candidates';
import { describeDiagnostics } from '../peer/diagnostics';
import type { LinkSignal, MediaLink, PeerConnector } from '../peer/message-link';
import { summarizeReceive, type ReceiveStats } from '../peer/receive-stats';
import {
  normalizeChatText,
  parseHostMessage,
  serialize,
  type ChatMessage,
  type Participant,
} from '../protocol/messages';
import { SessionError } from './session-error';

export type ViewerState = 'waiting-for-host' | 'connected' | 'disconnected';

/**
 * The viewer's own share: `requested` while the host decides, `sharing` once the host
 * allowed it and the stream is sent.
 */
export type ShareState = 'idle' | 'requested' | 'sharing';

/** Why the viewer's last share did not start or came to an end without the viewer asking. */
export type ShareEnd = 'declined' | 'busy' | 'revoked';

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
  /** The viewer's own share asked, started or ended. */
  share: ShareState;
}

export interface JoinOptions {
  viewerName: string;
  connector: PeerConnector;
  /** How often the viewer tells the host how the picture arrives; for tests. */
  reportIntervalMs?: number;
}

const DEFAULT_REPORT_INTERVAL_MS = 2_000;

/** The viewer side of a watch session. It follows whatever the host sends. */
export class ViewerSession {
  private readonly emitter = new Emitter<ViewerSessionEvents>();
  private currentState: ViewerState = 'waiting-for-host';
  private ownId: string | null = null;
  private roster: Participant[] = [];
  private readonly log = createLogger('session.viewer');
  private left = false;
  private removed = false;
  private currentMedia: SharedMedia | null = null;
  /** Who the media in the running negotiation comes from; answers carry it back. */
  private offeredBy: string | null = null;
  /** Who announced a share that has not ended; media is shown only while this is set. */
  private sharer: string | null = null;
  private shareState: ShareState = 'idle';
  private shareEnd: ShareEnd | null = null;
  /** The stream the viewer holds: waiting for the host's answer, or sent. */
  private ownStream: MediaStream | null = null;
  private reportTimer: ReturnType<typeof setInterval> | null = null;
  private lastReading: ReceiveStats | null = null;
  private reading = false;

  private constructor(
    readonly hostName: string,
    private readonly link: MediaLink,
    private readonly reportIntervalMs: number,
  ) {
    link.events.on('open', () => this.setState('connected'));
    link.events.on('close', () => {
      this.stopReporting();
      this.setState('disconnected');
      if (this.shareState !== 'idle') this.setShare('idle', null);
    });
    link.events.on('message', (raw) => this.handleMessage(raw));
    link.events.on('signal', (signal) => {
      if (this.link.state !== 'open') return;
      if (signal.type === 'answer' && this.offeredBy !== null) {
        this.link.send(
          serialize({ type: 'media-answer', sourceId: this.offeredBy, sdp: signal.sdp }),
        );
      } else if (signal.type === 'offer' && this.ownId !== null) {
        // The viewer's own share starts or ends; `sourceId` names who made the offer.
        this.link.send(serialize({ type: 'media-offer', sourceId: this.ownId, sdp: signal.sdp }));
      }
    });
    link.events.on('stream', (stream) => {
      if (this.sharer === null || stream === this.currentMedia?.stream) return;
      this.currentMedia = { sourceId: this.sharer, stream };
      this.startReporting();
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
    let replyCode: string;
    try {
      replyCode = await encodeReply({
        inviteId: invitation.inviteId,
        viewerName: options.viewerName,
        sdp,
      });
    } catch (error) {
      link.close();
      throw error;
    }
    return {
      session: new ViewerSession(
        invitation.hostName,
        link,
        options.reportIntervalMs ?? DEFAULT_REPORT_INTERVAL_MS,
      ),
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

  /** The host removed this viewer from the session, as opposed to the connection being lost. */
  get removedByHost(): boolean {
    return this.removed;
  }

  get participants(): Participant[] {
    return this.roster;
  }

  /** The shared picture, or `null` while nothing is shared. */
  get media(): SharedMedia | null {
    return this.currentMedia;
  }

  get share(): ShareState {
    return this.shareState;
  }

  /** Why the last share did not start or was ended by the host; `null` after a new request. */
  get lastShareEnd(): ShareEnd | null {
    return this.shareEnd;
  }

  /** The viewer's own stream while it waits for the host or is sent, or `null`. */
  get ownShare(): MediaStream | null {
    return this.ownStream;
  }

  /**
   * Asks the host to let the viewer share `stream`. The viewer picks the source first (a browser
   * only opens its picker on a fresh user action) and sends the stream once the host allows it.
   */
  requestShare(stream: MediaStream): void {
    // Without its id from the host's welcome, the viewer could not name itself in its offer.
    if (this.link.state !== 'open' || this.ownId === null) {
      throw new SessionError('not-connected', 'Not connected to the host.');
    }
    if (this.shareState !== 'idle') {
      throw new SessionError('invalid-message', 'A share is already running or asked for.');
    }
    this.ownStream = stream;
    this.link.send(serialize({ type: 'share-request' }));
    this.setShare('requested', null);
  }

  /** Cancels a request, or ends the share that is running. */
  stopSharing(): void {
    if (this.shareState === 'idle') return;
    if (this.link.state === 'open') this.link.send(serialize({ type: 'share-stop' }));
    this.endShare(null);
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

  /** What state the connection is in, for a message the viewer can copy. */
  get diagnostics(): string {
    return describeDiagnostics(this.link.diagnostics());
  }

  leave(): void {
    this.left = true;
    this.stopReporting();
    this.log.info('left the session');
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
        this.applySignal({ type: 'offer', sdp: message.sdp });
        break;
      case 'media-stopped':
        if (this.sharer === message.sourceId) this.sharer = null;
        if (this.currentMedia?.sourceId === message.sourceId) {
          this.currentMedia = null;
          this.stopReporting();
          this.emitter.emit('media', null);
        }
        break;
      case 'share-granted':
        if (this.shareState === 'requested' && this.ownStream) {
          try {
            this.link.setOutgoing(this.ownStream);
            this.setShare('sharing', null);
          } catch (error) {
            this.log.error('could not start the share', describeThrown(error));
            this.stopSharing();
          }
        }
        break;
      case 'share-denied':
        if (this.shareState === 'requested') this.endShare(message.reason);
        break;
      case 'share-revoked':
        if (this.shareState !== 'idle') this.endShare('revoked');
        break;
      case 'media-answer':
        if (message.sourceId === this.ownId) {
          this.applySignal({ type: 'answer', sdp: message.sdp });
        }
        break;
      case 'removed':
        // Said before the host closes the connection; leaving at once shows it without delay.
        this.removed = true;
        this.log.info('removed by the host');
        this.link.close();
        break;
      default:
        this.log.debug('dropped a message from the host', { length: raw.length });
    }
  }

  /** A description that cannot be applied leaves the link unable to negotiate: it is closed. */
  private applySignal(signal: LinkSignal): void {
    void this.link.receiveSignal(signal).catch((error) => {
      this.log.error('could not apply a media description', {
        type: signal.type,
        ...describeThrown(error),
      });
      this.link.close();
    });
  }

  /**
   * While a picture is shown the viewer tells the host how it arrives: the host sees what it sent,
   * only the viewer sees what got through and how long it waits to show it. The report is the
   * change since the last reading, so the first reading only sets the starting point.
   */
  private startReporting(): void {
    if (this.reportTimer !== null) return;
    this.reportTimer = setInterval(() => void this.report(), this.reportIntervalMs);
  }

  private stopReporting(): void {
    if (this.reportTimer !== null) clearInterval(this.reportTimer);
    this.reportTimer = null;
    this.lastReading = null;
  }

  private async report(): Promise<void> {
    if (this.reading || this.link.state !== 'open') return;
    this.reading = true;
    try {
      const current = await this.link.receiveStats();
      // The picture may have ended while the browser was reading.
      if (this.reportTimer === null) return;
      const previous = this.lastReading;
      this.lastReading = current;
      const report = previous && current ? summarizeReceive(previous, current) : null;
      if (report && this.link.state === 'open') {
        this.link.send(serialize({ type: 'receive-report', report }));
      }
    } catch (error) {
      this.log.debug('could not report the picture', describeThrown(error));
    } finally {
      this.reading = false;
    }
  }

  /** Ends the viewer's share: stops sending, and says why when it was not the viewer's own call. */
  private endShare(end: ShareEnd | null): void {
    if (this.shareState === 'sharing' && this.link.state === 'open') {
      try {
        this.link.setOutgoing(null);
      } catch (error) {
        this.log.warn('could not stop sending', describeThrown(error));
      }
    }
    this.setShare('idle', end);
  }

  private setShare(state: ShareState, end: ShareEnd | null): void {
    if (state === this.shareState && end === this.shareEnd) return;
    const changed = state !== this.shareState;
    this.shareState = state;
    this.shareEnd = end;
    if (state === 'idle') this.ownStream = null;
    if (changed) this.log.info('share', { state, ...(end ? { end } : {}) });
    this.emitter.emit('share', state);
  }

  private setState(state: ViewerState): void {
    if (this.currentState === state || this.currentState === 'disconnected') return;
    this.currentState = state;
    this.log[state === 'disconnected' && !this.left ? 'warn' : 'info']('state', { state });
    this.emitter.emit('state', state);
  }
}
