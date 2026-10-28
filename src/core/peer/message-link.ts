import type { Emitter } from '../events/emitter';
import type { MediaLimits } from '../media/quality';
import type { LinkDiagnostics } from './diagnostics';
import type { LinkStats } from './link-stats';

export type LinkState = 'connecting' | 'open' | 'closed';

/** A session description produced by a link; the session sends it to the other side. */
export interface LinkSignal {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface LinkEvents {
  open: undefined;
  message: string;
  close: undefined;
  /** The link wants the other side to receive this description (media negotiation). */
  signal: LinkSignal;
  /** The other side started sending media. */
  stream: MediaStream;
}

/** A bidirectional text channel to exactly one remote peer. */
export interface MessageLink {
  readonly state: LinkState;
  readonly events: Pick<Emitter<LinkEvents>, 'on'>;
  send(data: string): void;
  close(): void;
}

/**
 * A message link that can also carry media. Negotiation is symmetric ("perfect
 * negotiation"): either side may start one, and offers that cross resolve
 * themselves. The link only produces and consumes descriptions; getting them
 * to the other side is the session's job, through `signal` and `receiveSignal`.
 */
export interface MediaLink extends MessageLink {
  /** Sends this stream to the other side; `null` stops sending. Only works once the link is open. */
  setOutgoing(stream: MediaStream | null): void;
  /** The state of the link for an error message; contains no addresses. */
  diagnostics(): LinkDiagnostics;
  /** Caps what is sent of the video: now, and again after every renegotiation. */
  setMediaLimits(limits: MediaLimits): Promise<void>;
  /**
   * Counters of the picture this link sends, for the host's load monitor (ADR-0006). `null` while
   * no picture is sent and once the link is closed.
   */
  stats(): Promise<LinkStats | null>;
  /** Applies a description from the other side. May emit an answer as `signal`. */
  receiveSignal(signal: LinkSignal): Promise<void>;
}

/** A link created by the host; it opens once the viewer's answer is applied. */
export interface OfferingLink extends MediaLink {
  acceptAnswer(sdp: string): Promise<void>;
}

/** Creates links. Sessions depend on this instead of on WebRTC directly. */
export interface PeerConnector {
  createOffer(): Promise<{ link: OfferingLink; sdp: string }>;
  acceptOffer(offerSdp: string): Promise<{ link: MediaLink; sdp: string }>;
}
