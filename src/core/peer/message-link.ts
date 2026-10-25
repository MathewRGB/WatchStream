import type { Emitter } from '../events/emitter';

export type LinkState = 'connecting' | 'open' | 'closed';

export interface LinkEvents {
  open: undefined;
  message: string;
  close: undefined;
}

/** A bidirectional text channel to exactly one remote peer. */
export interface MessageLink {
  readonly state: LinkState;
  readonly events: Pick<Emitter<LinkEvents>, 'on'>;
  send(data: string): void;
  close(): void;
}

/** A link created by the host; it opens once the viewer's answer is applied. */
export interface OfferingLink extends MessageLink {
  acceptAnswer(sdp: string): Promise<void>;
}

/** Creates links. Sessions depend on this instead of on WebRTC directly. */
export interface PeerConnector {
  createOffer(): Promise<{ link: OfferingLink; sdp: string }>;
  acceptOffer(offerSdp: string): Promise<{ link: MessageLink; sdp: string }>;
}
