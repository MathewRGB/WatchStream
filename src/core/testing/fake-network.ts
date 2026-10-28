import { Emitter } from '../events/emitter';
import type { MediaLimits } from '../media/quality';
import type { LinkDiagnostics } from '../peer/diagnostics';
import type { LinkStats } from '../peer/link-stats';
import type {
  LinkEvents,
  LinkSignal,
  LinkState,
  MediaLink,
  OfferingLink,
  PeerConnector,
} from '../peer/message-link';

/**
 * In-memory stand-in for WebRTC, used by unit tests. Messages are delivered
 * asynchronously, like on a real data channel.
 */
export class FakeLink implements OfferingLink {
  readonly emitter = new Emitter<LinkEvents>();
  remote: FakeLink | null = null;
  /** Makes `send` throw while the state still reads `open`, like a data channel that is closing. */
  failSends = false;
  /** What this side currently sends, as set through `setOutgoing`. */
  outgoing: MediaStream | null = null;
  private outgoingTracks: unknown[] = [];
  /** What the other side sends; one object for the life of the link, like the real link's. */
  readonly remoteStream = new MediaStream();
  /** Descriptions received through `receiveSignal`, in order. */
  readonly received: LinkSignal[] = [];
  /** The latest limits set through `setMediaLimits`. */
  limits: MediaLimits | null = null;
  private currentState: LinkState = 'connecting';

  constructor(
    private readonly network: FakeNetwork,
    readonly sdp: string,
  ) {}

  get state(): LinkState {
    return this.currentState;
  }

  get events(): Pick<Emitter<LinkEvents>, 'on'> {
    return this.emitter;
  }

  async acceptAnswer(sdp: string): Promise<void> {
    const answer = this.network.findAnswer(sdp);
    if (!answer) throw new Error(`Unknown answer: ${sdp}`);
    if (this.network.blockConnections) return;
    this.remote = answer;
    answer.remote = this;
    queueMicrotask(() => {
      this.open();
      answer.open();
    });
  }

  send(data: string): void {
    if (this.currentState !== 'open' || this.failSends) throw new Error('The link is not open.');
    const remote = this.remote;
    this.network.sent.push(data);
    queueMicrotask(() => {
      if (remote?.state === 'open') remote.emitter.emit('message', data);
    });
  }

  setOutgoing(stream: MediaStream | null): void {
    if (this.currentState !== 'open') throw new Error('The link is not open.');
    // Tests also pass plain objects as streams.
    const tracks = stream?.getTracks?.() ?? [];
    const same =
      stream === this.outgoing &&
      tracks.length === this.outgoingTracks.length &&
      tracks.every((track, i) => track === this.outgoingTracks[i]);
    if (same) return;
    this.outgoing = stream;
    this.outgoingTracks = [...tracks];
    // Like `negotiationneeded` in a browser, the offer comes after the caller has returned.
    const sdp = `v=0\r\nfake-media-${this.network.nextMedia++}\r\n`;
    queueMicrotask(() => this.emitter.emit('signal', { type: 'offer', sdp }));
  }

  diagnostics(): LinkDiagnostics {
    const none = { local: 0, stun: 0, relay: 0, globalIpv6: 0 };
    return {
      connection: this.currentState,
      ice: this.currentState,
      gathering: 'complete',
      signaling: 'stable',
      own: none,
      remote: none,
      path: '',
    };
  }

  async setMediaLimits(limits: MediaLimits): Promise<void> {
    this.limits = limits;
  }

  /** What `stats()` answers; a test sets it, as the browser would count on. `null`: no picture. */
  statsReading: LinkStats | null = null;

  async stats(): Promise<LinkStats | null> {
    return this.currentState === 'closed' ? null : this.statsReading;
  }

  async receiveSignal(signal: LinkSignal): Promise<void> {
    this.received.push(signal);
    if (signal.type === 'offer') {
      this.emitter.emit('signal', { type: 'answer', sdp: 'v=0\r\nfake-media-answer\r\n' });
      this.emitter.emit('stream', this.remoteStream);
    }
  }

  close(): void {
    if (this.currentState === 'closed') return;
    this.currentState = 'closed';
    this.emitter.emit('close', undefined);
    const remote = this.remote;
    queueMicrotask(() => remote?.close());
  }

  /** Simulates a raw message from the remote peer, bypassing validation. */
  receive(data: string): void {
    this.emitter.emit('message', data);
  }

  private open(): void {
    if (this.currentState !== 'connecting') return;
    this.currentState = 'open';
    this.emitter.emit('open', undefined);
  }
}

export class FakeNetwork implements PeerConnector {
  /** When set, accepted answers never lead to an open connection. */
  blockConnections = false;
  readonly sent: string[] = [];
  nextMedia = 0;
  readonly offers: FakeLink[] = [];
  readonly answers: FakeLink[] = [];

  async createOffer(): Promise<{ link: OfferingLink; sdp: string }> {
    const link = new FakeLink(this, `v=0\r\nfake-offer-${this.offers.length}\r\n`);
    this.offers.push(link);
    return { link, sdp: link.sdp };
  }

  async acceptOffer(offerSdp: string): Promise<{ link: MediaLink; sdp: string }> {
    if (!this.offers.some((offer) => offer.sdp === offerSdp)) {
      throw new Error(`Unknown offer: ${offerSdp}`);
    }
    const link = new FakeLink(this, `v=0\r\nfake-answer-${this.answers.length}\r\n`);
    this.answers.push(link);
    return { link, sdp: link.sdp };
  }

  findAnswer(sdp: string): FakeLink | undefined {
    return this.answers.find((answer) => answer.sdp === sdp);
  }
}
