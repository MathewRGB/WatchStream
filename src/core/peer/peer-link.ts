import { Emitter } from '../events/emitter';
import { createLogger, describeThrown, type Logger } from '../log/logger';
import type { MediaLimits } from '../media/quality';
import { summarizeCandidates } from './candidates';
import { readLinkStats, type LinkStats } from './link-stats';
import { readReceiveStats, type ReceiveStats } from './receive-stats';
import { tuneOpus } from './opus';
import { DEFAULT_CODEC, preferVideoCodecs, type CodecId } from './video-codecs';
import type { LinkDiagnostics } from './diagnostics';
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

/** The frame rate last asked of each captured track, so that several links ask once. */
const askedFrameRate = new WeakMap<MediaStreamTrack, number>();

const NO_CANDIDATES = { local: 0, stun: 0, relay: 0, globalIpv6: 0 };
const EMPTY_DIAGNOSTICS: LinkDiagnostics = {
  connection: 'new',
  ice: 'new',
  gathering: 'new',
  signaling: 'stable',
  own: NO_CANDIDATES,
  remote: NO_CANDIDATES,
  path: '',
};

/** The fields of a WebRTC stats report that the path lookup reads. */
interface StatsReport extends RTCStats {
  selectedCandidatePairId?: string;
  localCandidateId?: string;
  remoteCandidateId?: string;
  nominated?: boolean;
  candidateType?: string;
}

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
  private limits: MediaLimits | null = null;
  private codec: CodecId = DEFAULT_CODEC;
  private makingOffer = false;
  /**
   * The steps of the negotiation (`receiveSignal`, offers) run one after the other. The browser
   * answers `InvalidStateError` to a step that starts while another one is half done, and a host
   * that changes the codec or quality again and again sends offers faster than they are answered.
   */
  private queue: Promise<unknown> = Promise.resolve();
  /** An offer was wanted while the signaling state was not stable; made once it is. */
  private offerWanted = false;
  /**
   * Everything the other side sends ends up in this one stream. The streams
   * that come with `track` events are not used: a browser makes new ones for
   * each negotiation and takes the tracks out again, so a stream handed to a
   * `<video>` element would go empty after the next stop and start.
   */
  private readonly remote = new MediaStream();
  private readonly watched = new Set<MediaStream>();
  private readonly log: Logger;
  /** Kinds of the connected candidate pair, e.g. `srflx/srflx`; empty until connected. */
  private path = '';
  private lastDiagnostics: LinkDiagnostics = EMPTY_DIAGNOSTICS;

  /**
   * `polite` decides who yields when two offers cross: the viewer side is
   * polite, the host side is not.
   */
  private constructor(
    private readonly connection: RTCPeerConnection,
    private readonly polite: boolean,
  ) {
    this.log = createLogger(polite ? 'link.viewer' : 'link.host');
    connection.addEventListener('connectionstatechange', () => {
      const state = connection.connectionState;
      if (state !== 'closed') this.lastDiagnostics = this.readDiagnostics();
      const level = state === 'failed' ? 'warn' : 'info';
      this.log[level]('connection state', { state, ice: connection.iceConnectionState });
      if (state === 'connected') void this.recordPath();
      // The viewer's ICE starts as soon as it has the offer, long before the host has the reply
      // (a person has to carry it). Its early failure says nothing about the connection the host
      // starts afterwards, so a link that never opened only ends when the session gives up on it:
      // the host's timeout, or the person leaving.
      if (state === 'closed' || (state === 'failed' && this.currentState === 'open')) {
        this.markClosed(`connection ${state}`);
      }
    });
    connection.addEventListener('iceconnectionstatechange', () =>
      this.log.info('ice state', { ice: connection.iceConnectionState }),
    );
    // Typically a STUN server that did not answer; it is why a code has no public address.
    connection.addEventListener('icecandidateerror', (event) => {
      const error = event as RTCPeerConnectionIceErrorEvent;
      this.log.warn('ice candidate error', {
        code: error.errorCode,
        text: error.errorText,
        server: error.url,
      });
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
    // Another stream replaces everything. The same stream is synced with its tracks as they are
    // now: a stream that is forwarded from a viewer gains its video and its sound one at a time.
    if (stream !== this.outgoing) {
      for (const sender of this.senders.splice(0)) this.connection.removeTrack(sender);
    }
    this.outgoing = stream;
    const wanted = stream?.getTracks() ?? [];
    for (const sender of [...this.senders]) {
      if (sender.track && wanted.includes(sender.track)) continue;
      this.connection.removeTrack(sender);
      this.senders.splice(this.senders.indexOf(sender), 1);
    }
    for (const track of wanted) {
      if (!this.senders.some((sender) => sender.track === track)) {
        const sender = this.connection.addTrack(track, stream!);
        this.senders.push(sender);
        if (track.kind === 'video') this.preferCodecs(sender);
      }
    }
  }

  receiveSignal(signal: LinkSignal): Promise<void> {
    return this.enqueue(() => this.applySignal(signal));
  }

  /** Runs `task` after every earlier one is done, whether it succeeded or not. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async applySignal(signal: LinkSignal): Promise<void> {
    const collision =
      signal.type === 'offer' && (this.makingOffer || this.connection.signalingState !== 'stable');
    // With every candidate inside the descriptions, a crossing offer is the only thing the impolite
    // side ever drops, so the decision is not kept.
    if (!this.polite && collision) {
      this.log.info('ignored a crossing offer');
      return;
    }

    // A polite peer's setRemoteDescription rolls back its own pending offer.
    await this.connection.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
    if (signal.type === 'offer') {
      const answer = await this.connection.createAnswer();
      await this.connection.setLocalDescription({
        type: 'answer',
        sdp: tuneOpus(answer.sdp ?? ''),
      });
      this.emitLocalDescription('answer');
    } else {
      // Encodings only exist once the negotiation is complete.
      await this.applyLimits();
    }
    // A change that wanted an offer while this one was open can make it now.
    if (this.offerWanted && this.connection.signalingState === 'stable') await this.makeOffer();
  }

  async setMediaLimits(limits: MediaLimits): Promise<void> {
    this.limits = limits;
    await this.applyLimits();
  }

  stats(): Promise<LinkStats | null> {
    return this.readStats(readLinkStats);
  }

  receiveStats(): Promise<ReceiveStats | null> {
    return this.readStats(readReceiveStats);
  }

  /** Reads the browser's statistics with `read`; `null` once the link is closed. */
  private async readStats<T>(
    read: (reports: Iterable<StatsReport>, now: number) => T | null,
  ): Promise<T | null> {
    if (this.currentState === 'closed') return null;
    try {
      return read((await this.statsReports()).values(), performance.now());
    } catch {
      // Firefox refuses to read a closed connection; there is nothing to say then.
      return null;
    }
  }

  private async statsReports(): Promise<Map<string, StatsReport>> {
    return (await this.connection.getStats()) as unknown as Map<string, StatsReport>;
  }

  diagnostics(): LinkDiagnostics {
    try {
      this.lastDiagnostics = this.readDiagnostics();
      return this.lastDiagnostics;
    } catch {
      // Firefox refuses to read a closed connection. The last state we saw is the useful one.
      return { ...this.lastDiagnostics, connection: 'closed', ice: 'closed' };
    }
  }

  close(): void {
    this.diagnostics();
    this.channel?.close();
    this.connection.close();
    this.markClosed('closed locally');
  }

  private attach(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.addEventListener('open', () => {
      if (this.currentState === 'connecting') {
        this.currentState = 'open';
        this.log.info('channel open');
        this.emitter.emit('open', undefined);
      }
    });
    channel.addEventListener('error', (event) => {
      const error = (event as RTCErrorEvent).error;
      this.log.warn('channel error', { name: error?.name ?? 'unknown' });
    });
    channel.addEventListener('message', (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        this.emitter.emit('message', event.data);
      }
    });
    channel.addEventListener('close', () => this.markClosed('channel closed'));
  }

  /**
   * Orders the codecs this video sender offers (see `preferVideoCodecs`). A browser without the
   * call keeps its own order. Returns whether the order was set.
   */
  private preferCodecs(sender: RTCRtpSender): boolean {
    // Firefox gets its H.264 from a plugin it downloads on demand; without it a preference for
    // H.264 leaves the picture out. Its own order (VP8 first) stays.
    if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) return false;
    const transceiver = this.connection.getTransceivers().find((t) => t.sender === sender);
    const codecs = RTCRtpSender.getCapabilities?.('video')?.codecs;
    if (!transceiver || !codecs || !transceiver.setCodecPreferences) return false;
    try {
      transceiver.setCodecPreferences(preferVideoCodecs(codecs, this.codec));
      return true;
    } catch (error) {
      this.log.warn('could not set codec preferences', describeThrown(error));
      return false;
    }
  }

  async setVideoCodec(codec: CodecId): Promise<void> {
    if (codec === this.codec) return;
    this.codec = codec;
    let changed = false;
    for (const sender of this.senders) {
      if (sender.track?.kind === 'video' && this.preferCodecs(sender)) changed = true;
    }
    // The order counts from the next offer on; a picture that is already sent needs one now.
    if (changed) await this.negotiate();
  }

  private async applyLimits(): Promise<void> {
    const limits = this.limits;
    if (!limits) return;
    for (const sender of this.senders) {
      const track = sender.track;
      if (!track) continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings || parameters.encodings.length === 0) continue;
      for (const encoding of parameters.encodings) {
        if (track.kind === 'audio') {
          encoding.maxBitrate = limits.maxAudioBitrateBps;
        } else {
          const height = track.getSettings().height ?? limits.maxHeight;
          // What is shared is mostly film and sport: smooth motion over sharp single frames. When
          // the encoder falls behind, it lowers the resolution and keeps the frame rate.
          track.contentHint = 'motion';
          parameters.degradationPreference = 'maintain-framerate';
          encoding.maxBitrate = limits.maxBitrateBps;
          encoding.maxFramerate = limits.maxFramerate;
          encoding.scaleResolutionDownBy = Math.max(1, height / limits.maxHeight);
        }
      }
      if (track.kind === 'video') this.followFrameRate(track, limits.maxFramerate);
      try {
        await sender.setParameters(parameters);
      } catch (error) {
        // The sender changed meanwhile (a renegotiation); the next answer applies the limits again.
        this.log.warn('could not apply media limits', {
          kind: track.kind,
          ...describeThrown(error),
        });
      }
    }
  }

  /**
   * Asks the capture for the frame rate that is sent, up or down: it was started for the highest
   * one a host can choose, and frames the encoder would drop are not worth capturing. A track that
   * takes no such request (a canvas) keeps what it has.
   */
  private followFrameRate(track: MediaStreamTrack, framerate: number): void {
    if (askedFrameRate.get(track) === framerate) return;
    askedFrameRate.set(track, framerate);
    track.applyConstraints({ frameRate: { ideal: framerate } }).catch((error) => {
      this.log.debug('could not follow the frame rate', describeThrown(error));
    });
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

  private negotiate(): Promise<void> {
    return this.enqueue(() => this.makeOffer());
  }

  private async makeOffer(): Promise<void> {
    // Before the channel is open the handshake codes do the negotiating.
    if (this.currentState !== 'open') return;
    // The other side has not answered the last offer yet: a second one would meet an answer meant
    // for the first. It is made as soon as the answer is applied.
    if (this.connection.signalingState !== 'stable') {
      this.offerWanted = true;
      return;
    }
    this.offerWanted = false;
    try {
      this.makingOffer = true;
      const offer = await this.connection.createOffer();
      await this.connection.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp ?? '') });
      this.emitLocalDescription('offer');
    } catch (error) {
      this.log.error('media negotiation failed', describeThrown(error));
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
    const timedOut = await waitForIceGathering(
      this.connection,
      config.iceGatheringTimeoutMs ?? DEFAULT_ICE_GATHERING_TIMEOUT_MS,
    );
    const description = this.connection.localDescription;
    if (!description) {
      throw new Error('No local session description was created.');
    }
    // A timeout means a STUN server was too slow; the code then lacks its public address.
    this.log[timedOut ? 'warn' : 'info']('candidates gathered', {
      timedOut,
      ...summarizeCandidates(description.sdp),
    });
    return description.sdp;
  }

  private readDiagnostics(): LinkDiagnostics {
    const connection = this.connection;
    return {
      connection: connection.connectionState,
      ice: connection.iceConnectionState,
      gathering: connection.iceGatheringState,
      signaling: connection.signalingState,
      own: summarizeCandidates(connection.localDescription?.sdp ?? ''),
      remote: summarizeCandidates(connection.remoteDescription?.sdp ?? ''),
      path: this.path,
    };
  }

  private async recordPath(): Promise<void> {
    try {
      const stats = await this.statsReports();
      let pair: StatsReport | undefined;
      for (const report of stats.values()) {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          pair = stats.get(report.selectedCandidatePairId);
        }
      }
      // Firefox has no transport report with a selected pair.
      pair ??= [...stats.values()].find((r) => r.type === 'candidate-pair' && r.nominated);
      if (!pair) return;
      const kind = (id?: string) => (id && stats.get(id)?.candidateType) || 'unknown';
      this.path = `${kind(pair.localCandidateId)}/${kind(pair.remoteCandidateId)}`;
      this.log.info('connected', { path: this.path });
    } catch (error) {
      this.log.debug('could not read the connected path', describeThrown(error));
    }
  }

  private markClosed(reason: string): void {
    if (this.currentState === 'closed') return;
    this.log.info('link closed', { reason, wasOpen: this.currentState === 'open' });
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

/** Resolves once gathering is complete, or after `timeoutMs`; the value says whether it timed out. */
function waitForIceGathering(connection: RTCPeerConnection, timeoutMs: number): Promise<boolean> {
  if (connection.iceGatheringState === 'complete') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const finish = (timedOut: boolean) => {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', onChange);
      resolve(timedOut);
    };
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish(false);
    };
    const timer = setTimeout(() => finish(true), timeoutMs);
    connection.addEventListener('icegatheringstatechange', onChange);
  });
}
