import type { PcmMessage } from './relay';

/** How far ahead of the clock the first block is scheduled; it absorbs the jitter of the port. */
const LEAD_SECONDS = 0.1;
/** Below this much buffered sound the playback has run dry and starts over with the full lead. */
const UNDERRUN_SECONDS = 0.02;
/** More than this buffered means the sender is faster than the clock; the block is dropped. */
const MAX_BUFFERED_SECONDS = 0.5;

/**
 * Turns the blocks of a tab's sound back into a live audio track. Firefox cannot share tab
 * sound through `getDisplayMedia`, so the page that holds the connection receives the sound as
 * numbers, from a script in the tab, and plays it into a `MediaStreamAudioDestinationNode`,
 * whose track goes out like any other.
 */
export class TabSoundSink {
  readonly track: MediaStreamTrack;
  private readonly destination: MediaStreamAudioDestinationNode;
  private playAt = 0;
  private closed = false;

  constructor(private readonly context: AudioContext = new AudioContext()) {
    this.destination = context.createMediaStreamDestination();
    const [track] = this.destination.stream.getAudioTracks();
    if (!track) throw new Error('The audio destination has no track.');
    this.track = track;
    // Closed again before it started (a share that ends at once) is no error.
    context.resume().catch(() => undefined);
  }

  push(message: PcmMessage): void {
    if (this.closed) return;
    const { channels, sampleRate } = message;
    const buffer = this.context.createBuffer(channels.length, channels[0]!.length, sampleRate);
    channels.forEach((samples, index) =>
      buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, index),
    );

    const now = this.context.currentTime;
    if (this.playAt - now > MAX_BUFFERED_SECONDS) return;
    if (this.playAt - now < UNDERRUN_SECONDS) this.playAt = now + LEAD_SECONDS;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);
    source.start(this.playAt);
    this.playAt += buffer.duration;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.track.stop();
    void this.context.close();
  }
}
