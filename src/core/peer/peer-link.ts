import { Emitter } from '../events/emitter';
import type { LinkEvents, LinkState, OfferingLink, PeerConnector } from './message-link';

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

  private constructor(private readonly connection: RTCPeerConnection) {
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        this.markClosed();
      }
    });
  }

  static async createOffer(config: PeerConfig): Promise<{ link: PeerLink; sdp: string }> {
    const link = new PeerLink(new RTCPeerConnection({ iceServers: config.iceServers }));
    link.attach(link.connection.createDataChannel(CHANNEL_LABEL, { ordered: true }));
    const sdp = await link.createLocalDescription(config);
    return { link, sdp };
  }

  static async acceptOffer(
    offerSdp: string,
    config: PeerConfig,
  ): Promise<{ link: PeerLink; sdp: string }> {
    const link = new PeerLink(new RTCPeerConnection({ iceServers: config.iceServers }));
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
