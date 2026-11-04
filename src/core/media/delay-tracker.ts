/** Cumulative counters of one receiver's jitter buffer, as the browser reports them. */
export interface BufferCounter {
  /** Seconds all emitted units (frames; audio samples) together waited in the buffer. */
  delaySeconds: number;
  /** How many units left the buffer. */
  emitted: number;
}

/** What the viewer reads from its connection for the sound delay. */
export interface PlayoutCounters {
  video: BufferCounter | null;
  audio: BufferCounter | null;
}

/** Fewest new frames / samples in a round for its average to count. */
const MIN_VIDEO_FRAMES = 5;
const MIN_AUDIO_SAMPLES = 4_800;
/** How much of a new reading counts: the delay moves slowly, a round is noisy. */
const WEIGHT_OF_NEW = 0.3;
/** The sound is never delayed by more than this (the graph holds six seconds). */
export const MAX_AUDIO_DELAY_MS = 5_000;

/**
 * How long the sound has to be delayed to meet the picture: the time the picture waits in its
 * buffer minus the time the sound already waits in its own. Both come from the browser's
 * counters, averaged over the last round, because the buffer the picture really has depends on the
 * route and is larger than the target the viewer asked for. A fixed delay equal to the target left
 * the sound seconds early on a real connection. Pure: counters in, a number out.
 */
export class AudioDelayTracker {
  private video: BufferCounter | null = null;
  private audio: BufferCounter | null = null;
  private smoothed: number | null = null;
  /** The last wait of the sound that could be measured; stands in while a round has too few samples. */
  private lastAudioAverage: number | null = null;

  /**
   * Takes the latest counters; returns the delay in ms to give the sound, or `null` while nothing
   * is known (no picture moving, or only one reading).
   */
  update(counters: PlayoutCounters | null): number | null {
    const video = counters?.video ?? null;
    const audio = counters?.audio ?? null;
    const videoAverage = windowAverage(this.video, video, MIN_VIDEO_FRAMES);
    const audioAverage = windowAverage(this.audio, audio, MIN_AUDIO_SAMPLES);
    // A new receiver (the share began again) starts its counters over: begin the estimate over.
    if (restarted(this.video, video) || restarted(this.audio, audio)) {
      this.smoothed = null;
      this.lastAudioAverage = null;
    }
    if (video) this.video = video;
    if (audio) this.audio = audio;
    if (videoAverage === null) return this.current();

    // Without a sound track the picture's buffer is all there is; the sound it would meet is none.
    const lead = videoAverage - (audioAverage ?? this.lastAudioAverage ?? 0);
    if (audioAverage !== null) this.lastAudioAverage = audioAverage;
    const target = Math.min(MAX_AUDIO_DELAY_MS, Math.max(0, lead * 1000));
    this.smoothed =
      this.smoothed === null
        ? target
        : this.smoothed * (1 - WEIGHT_OF_NEW) + target * WEIGHT_OF_NEW;
    return this.current();
  }

  private current(): number | null {
    return this.smoothed === null ? null : Math.round(this.smoothed);
  }
}

/** Average wait over the units that left between two readings; `null` if too few or unusable. */
function windowAverage(
  before: BufferCounter | null,
  now: BufferCounter | null,
  minUnits: number,
): number | null {
  if (!before || !now || restarted(before, now)) return null;
  const units = now.emitted - before.emitted;
  if (units < minUnits) return null;
  const average = (now.delaySeconds - before.delaySeconds) / units;
  return Number.isFinite(average) && average >= 0 ? average : null;
}

/** A counter that fell started anew: its receiver was replaced. */
function restarted(before: BufferCounter | null, now: BufferCounter | null): boolean {
  return before !== null && now !== null && now.emitted < before.emitted;
}
