import { Emitter } from '../events/emitter';
import type {
  LinkEvents,
  LinkState,
  MessageLink,
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
  readonly offers: FakeLink[] = [];
  readonly answers: FakeLink[] = [];

  async createOffer(): Promise<{ link: OfferingLink; sdp: string }> {
    const link = new FakeLink(this, `v=0\r\nfake-offer-${this.offers.length}\r\n`);
    this.offers.push(link);
    return { link, sdp: link.sdp };
  }

  async acceptOffer(offerSdp: string): Promise<{ link: MessageLink; sdp: string }> {
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
