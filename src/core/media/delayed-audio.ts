import { planDelayChange } from './delay-plan';

/** How often the stream is checked for a sound track that arrived or went. */
const WATCH_INTERVAL_MS = 500;
/** The longest delay the graph can hold, in seconds; the longest playout buffer is 2 s. */
const MAX_DELAY_SECONDS = 6;
/** Fade out before a cut, and fade in after it, in seconds. */
const FADE_OUT_SECONDS = 0.08;
const FADE_IN_SECONDS = 0.15;

/**
 * Plays the sound of a received stream late, by a time that can be changed while it plays.
 *
 * Why this exists: the viewer's smoothing buffer (`jitterBufferTarget`) holds the PICTURE back
 * by the chosen time, but the browser does not hold the sound back with it. Measured in Chromium:
 * with 2 s or 4 s the picture was 1.98 s / 3.97 s late and the sound 10 ms, and the browser's own
 * lip sync did not close the gap. A sound that plays seconds before its picture is worse than a
 * stutter. So the buffer is set on the picture only, and the sound goes through a delay here.
 *
 * Changing the delay is where this goes wrong audibly: a delay that moves fast reads the sound
 * backwards or at triple speed (a scratch). So a small change glides at a slow, fixed rate and a
 * big one is a cut between two fades (`planDelayChange`).
 *
 * The element that shows the picture stays attached to the stream (muted): Chromium delivers the
 * sound of a remote stream to a graph only while the stream is attached to a media element.
 */
export class DelayedAudio {
  private readonly context: AudioContext;
  private readonly delay: DelayNode;
  /** Fades the sound around a cut; apart from the volume so the two never fight over a value. */
  private readonly fade: GainNode;
  private readonly gain: GainNode;
  private source: MediaStreamAudioSourceNode | null = null;
  private connectedTrack: string | null = null;
  private delayKnown = false;
  /** Where the delay is heading, in seconds; what a new request is compared with. */
  private heading = 0;
  /** The audio clock time until which a cut is under way; a new change waits for it. */
  private busyUntil = 0;
  private waiting: number | null = null;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly stream: MediaStream,
    delayMs: number,
    level: number,
  ) {
    this.context = new AudioContext({ latencyHint: 'playback' });
    this.delay = this.context.createDelay(MAX_DELAY_SECONDS);
    this.fade = this.context.createGain();
    this.gain = this.context.createGain();
    this.setDelay(delayMs);
    this.setLevel(level);
    this.delay.connect(this.fade).connect(this.gain).connect(this.context.destination);
    this.refresh();
    this.timer = setInterval(() => this.refresh(), WATCH_INTERVAL_MS);
  }

  /** A node after the volume, to listen at the output (the tests do). */
  get output(): AudioNode {
    return this.gain;
  }

  get audioContext(): AudioContext {
    return this.context;
  }

  /** The delay in seconds right now, mid-glide included (for the tests). */
  get delaySeconds(): number {
    return this.delay.delayTime.value;
  }

  /** The fade in front of the volume, 1 when open (for the tests). */
  get fadeLevel(): number {
    return this.fade.gain.value;
  }

  /**
   * Moves the delay to `ms`: at once the first time, then by a glide or a faded cut, whichever
   * `planDelayChange` says. A request that comes while a cut is under way is made right after it.
   */
  setDelay(ms: number): void {
    const target = Math.min(MAX_DELAY_SECONDS, Math.max(0, ms / 1000));
    if (!this.delayKnown) {
      this.delay.delayTime.value = target;
      this.heading = target;
      this.delayKnown = true;
      return;
    }
    const now = this.context.currentTime;
    if (now < this.busyUntil) {
      this.waiting = target;
      return;
    }
    this.waiting = null;
    const plan = planDelayChange(this.heading, target);
    const param = this.delay.delayTime;
    if (plan.kind === 'none') return;
    this.heading = target;
    param.cancelScheduledValues(now);
    if (plan.kind === 'glide') {
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(target, now + plan.seconds);
      return;
    }
    const cutAt = now + FADE_OUT_SECONDS;
    const fade = this.fade.gain;
    fade.cancelScheduledValues(now);
    fade.setValueAtTime(fade.value, now);
    fade.linearRampToValueAtTime(0, cutAt);
    param.setValueAtTime(param.value, now);
    param.setValueAtTime(target, cutAt);
    fade.setValueAtTime(0, cutAt);
    fade.linearRampToValueAtTime(1, cutAt + FADE_IN_SECONDS);
    this.busyUntil = cutAt + FADE_IN_SECONDS;
  }

  /** 0 (silent) to 1 (full). */
  setLevel(level: number): void {
    this.gain.gain.value = Math.min(1, Math.max(0, level));
  }

  /**
   * Starts the output; browsers keep an audio context suspended until the page has been used.
   * Resolves to whether sound is playing now.
   */
  async resume(): Promise<boolean> {
    try {
      await this.context.resume();
    } catch {
      return false;
    }
    return this.context.state === 'running';
  }

  dispose(): void {
    clearInterval(this.timer);
    this.source?.disconnect();
    this.source = null;
    void this.context.close().catch(() => undefined);
  }

  /** Follows the stream: the sound track may arrive after the picture, or be replaced. */
  private refresh(): void {
    if (this.waiting !== null && this.context.currentTime >= this.busyUntil) {
      this.setDelay(this.waiting * 1000);
    }
    const track = this.stream.getAudioTracks().find((t) => t.readyState === 'live');
    const id = track?.id ?? null;
    if (id === this.connectedTrack) return;
    this.source?.disconnect();
    this.source = null;
    this.connectedTrack = id;
    if (!track) return;
    this.source = this.context.createMediaStreamSource(new MediaStream([track]));
    this.source.connect(this.delay);
  }
}
