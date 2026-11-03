import type { Emitter } from '../events/emitter';
import type { MediaLimits } from '../media/quality';
import type { LinkDiagnostics } from './diagnostics';
import type { LinkStats } from './link-stats';
import type { ReceiveStats } from './receive-stats';
import type { WeakLinkMode } from '../media/weak-link';
import type { CodecId } from './video-codecs';

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
   * Which codec the picture is offered in first (see `video-codecs.ts`). Counts from the next
   * negotiation on, and starts one when a picture is already sent. Never removes a fallback.
   */
  setVideoCodec(codec: CodecId): Promise<void>;
  /**
   * What the sender gives up when the connection cannot carry the picture (see `weak-link.ts`).
   * Applies at once; a change of the bitrate floor starts a negotiation when a picture is sent.
   */
  setWeakLinkMode(mode: WeakLinkMode): Promise<void>;
  /**
   * How long the receiving side may buffer before it plays, in milliseconds, or `null` for the
   * browser's own choice (see `playout-buffer.ts`). Applies to what arrives now and later.
   */
  setPlayoutBuffer(targetMs: number | null): void;
  /**
   * Counters of the picture this link sends, for the host's load monitor. `null` while
   * no picture is sent and once the link is closed.
   */
  stats(): Promise<LinkStats | null>;
  /**
   * Counters of the picture this link receives, for the viewer's report to the host. `null`
   * while no picture arrives and once the link is closed.
   */
  receiveStats(): Promise<ReceiveStats | null>;
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
