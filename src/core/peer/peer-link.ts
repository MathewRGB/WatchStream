import { Emitter } from '../events/emitter';
import type {
  LinkEvents,
  LinkSignal,
  LinkState,
  OfferingLink,
  PeerConnector,
} from './message-link';

export interface PeerConfig {
  iceServers: RTCIceServer[];
  /** How long to wait for ICE candidates before sending what was found. */
  iceGatheringTimeoutMs?: number;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

const DEFAULT_ICE_GATHERING_TIMEOUT_MS = 3000;
const CHANNEL_LABEL = 'watchstream';

/**
 * A WebRTC data channel to one remote peer. Signaling is non-trickle: all
 * ICE candidates are gathered first and travel inside the session
 * description, so one invitation and one reply are enough.
 */
export class PeerLink implements OfferingLink {
  private readonly emitter = new Emitter<LinkEvents>();
  private channel: RTCDataChannel | null = null;
  private currentState: LinkState = 'connecting';
  private readonly senders: RTCRtpSender[] = [];
  private outgoing: MediaStream | null = null;
  private makingOffer = false;
  private ignoreOffer = false;
  /**
   * Everything the other side sends ends up in this one stream. The streams
   * that come with `track` events are not used: a browser makes new ones for
   * each negotiation and takes the tracks out again, so a stream handed to a
   * `<video>` element would go empty after the next stop and start.
   */
  private readonly remote = new MediaStream();
  private readonly watched = new Set<MediaStream>();

  /**
   * `polite` decides who yields when two offers cross: the viewer side is
   * polite, the host side is not.
   */
  private constructor(
    private readonly connection: RTCPeerConnection,
    private readonly polite: boolean,
  ) {
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.markClosed();
      }
    });
    connection.addEventListener('negotiationneeded', () => void this.negotiate());
    connection.addEventListener('track', (event) => this.receiveTrack(event));
  }

  static async createOffer(config: PeerConfig): Promise<{ link: PeerLink; sdp: string }> {
    const link = new PeerLink(new RTCPeerConnection({ iceServers: config.iceServers }), false);
    link.attach(link.connection.createDataChannel(CHANNEL_LABEL, { ordered: true }));
    const sdp = await link.createLocalDescription(config);
    return { link, sdp };
  }

  static async acceptOffer(
    offerSdp: string,
    config: PeerConfig,
  ): Promise<{ link: PeerLink; sdp: string }> {
    const link = new PeerLink(new RTCPeerConnection({ iceServers: config.iceServers }), true);
    link.connection.addEventListener('datachannel', (event) => link.attach(event.channel));
    try {
      await link.connection.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const sdp = await link.createLocalDescription(config);
      return { link, sdp };
    } catch (error) {
      link.close();
      throw error;
    }
  }

  get state(): LinkState {
    return this.currentState;
  }

  get events(): Pick<Emitter<LinkEvents>, 'on'> {
    return this.emitter;
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.connection.setRemoteDescription({ type: 'answer', sdp });
  }

  send(data: string): void {
    if (this.currentState !== 'open' || !this.channel) {
      throw new Error('The link is not open.');
    }
    this.channel.send(data);
  }

  setOutgoing(stream: MediaStream | null): void {
    if (this.currentState !== 'open') {
      throw new Error('The link is not open.');
    }
    if (stream === this.outgoing) return;
    for (const sender of this.senders.splice(0)) this.connection.removeTrack(sender);
    this.outgoing = stream;
    for (const track of stream?.getTracks() ?? []) {
      this.senders.push(this.connection.addTrack(track, stream!));
    }
  }

  async receiveSignal(signal: LinkSignal): Promise<void> {
    const collision =
      signal.type === 'offer' && (this.makingOffer || this.connection.signalingState !== 'stable');
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return;

    // A polite peer's setRemoteDescription rolls back its own pending offer.
    await this.connection.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    if (signal.type === 'offer') {
      await this.connection.setLocalDescription();
      this.emitLocalDescription('answer');
    }
  }

  close(): void {
    this.channel?.close();
    this.connection.close();
    this.markClosed();
  }

  private attach(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener('open', () => {
      if (this.currentState === 'connecting') {
        this.currentState = 'open';
        this.emitter.emit('open', undefined);
      }
    });
    channel.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        this.emitter.emit('message', event.data);
      }
    });
    channel.addEventListener('close', () => this.markClosed());
  }

  private receiveTrack(event: RTCTrackEvent): void {
    if (!this.remote.getTracks().includes(event.track)) this.remote.addTrack(event.track);
    for (const source of event.streams) {
      if (this.watched.has(source)) continue;
      this.watched.add(source);
      source.addEventListener('removetrack', (removed) => this.remote.removeTrack(removed.track));
    }
    this.emitter.emit('stream', this.remote);
  }

  private async negotiate(): Promise<void> {
    // Before the channel is open the handshake codes do the negotiating.
    if (this.currentState !== 'open') return;
    try {
      this.makingOffer = true;
      await this.connection.setLocalDescription();
      this.emitLocalDescription('offer');
    } finally {
      this.makingOffer = false;
    }
  }

  private emitLocalDescription(type: LinkSignal['type']): void {
    const description = this.connection.localDescription;
    if (description) this.emitter.emit('signal', { type, sdp: description.sdp });
  }

  private async createLocalDescription(config: PeerConfig): Promise<string> {
    await this.connection.setLocalDescription();
    await waitForIceGathering(
      this.connection,
      config.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS,
    );
    const description = this.connection.localDescription;
    if (!description) {
      throw new Error('No local session description was created.');
    }
    return description.sdp;
  }

  private markClosed(): void {
    if (this.currentState === 'closed') return;
    this.currentState = 'closed';
    this.emitter.emit('close', undefined);
    this.emitter.clear();
  }
}

/** A `PeerConnector` backed by real WebRTC connections. */
export function createPeerConnector(config: PeerConfig): PeerConnector {
  return {
    createOffer: () => PeerLink.createOffer(config),
    acceptOffer: (offerSdp) => PeerLink.acceptOffer(offerSdp, config),
  };
}

function waitForIceGathering(connection: RTCPeerConnection, timeoutMs: number): Promise<void> {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    connection.addEventListener('icegatheringstatechange', onChange);
  });
}
