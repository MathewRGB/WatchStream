import { describe, expect, it } from 'vitest';
import { MAX_SLEW } from '../../src/core/media/delay-plan';
import { DelayedAudio } from '../../src/core/media/delayed-audio';

/** A live sound track with no network: the delay graph is what is under test. */
function toneStream(): { stream: MediaStream; stop: () => void } {
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  audio.resume().catch(() => undefined);
  return { stream: destination.stream, stop: () => void audio.close() };
}

interface Sample {
  at: number;
  delay: number;
  fade: number;
}

/** Reads the delay and the fade every 20 ms for `ms`. */
async function sample(audio: DelayedAudio, ms: number): Promise<Sample[]> {
  const samples: Sample[] = [];
  const start = performance.now();
  while (performance.now() - start < ms) {
    samples.push({ at: performance.now(), delay: audio.delaySeconds, fade: audio.fadeLevel });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return samples;
}

/** The steepest change of delay per second between two samples. */
function steepest(samples: Sample[]): { up: number; down: number } {
  let up = 0;
  let down = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const seconds = (samples[i]!.at - samples[i - 1]!.at) / 1000;
    if (seconds <= 0) continue;
    const slope = (samples[i]!.delay - samples[i - 1]!.delay) / seconds;
    up = Math.max(up, slope);
    down = Math.min(down, slope);
  }
  return { up, down };
}

describe('DelayedAudio changing its delay', () => {
  it('glides a small correction at a rate that cannot reverse or race the sound', async () => {
    const { stream, stop } = toneStream();
    const audio = new DelayedAudio(stream, 1000, 1);
    await audio.resume();
    try {
      audio.setDelay(1200);
      const samples = await sample(audio, 1500);

      const { up, down } = steepest(samples);
      // Positive control: it did move, and to the right place.
      expect(samples.at(-1)!.delay).toBeGreaterThan(1.05);
      expect(down).toBeGreaterThanOrEqual(-1e-6);
      // Sampling and the audio clock are not in step; allow a little over the limit, far under 1.
      expect(up).toBeLessThan(MAX_SLEW * 3);
      // A glide does not duck the sound.
      expect(Math.min(...samples.map((s) => s.fade))).toBeGreaterThan(0.99);
    } finally {
      audio.dispose();
      stop();
    }
  }, 20_000);

  it('cuts a big change between two fades, with no glide through the delays between', async () => {
    const { stream, stop } = toneStream();
    const audio = new DelayedAudio(stream, 0, 1);
    await audio.resume();
    try {
      audio.setDelay(2000);
      const samples = await sample(audio, 800);

      const delays = new Set(samples.map((s) => Math.round(s.delay * 100) / 100));
      // Only the old and the new value ever appear: nothing is read at a speed in between.
      expect([...delays].every((d) => d === 0 || d === 2)).toBe(true);
      expect(samples.at(-1)!.delay).toBe(2);
      // The sound was faded out at the cut and is back in.
      expect(Math.min(...samples.map((s) => s.fade))).toBeLessThan(0.25);
      expect(samples.at(-1)!.fade).toBeGreaterThan(0.95);
      // The delay changed while the sound was down.
      const cut = samples.find((s) => s.delay === 2)!;
      expect(cut.fade).toBeLessThan(0.25);
    } finally {
      audio.dispose();
      stop();
    }
  }, 20_000);

  it('cuts back down to Standard the same way', async () => {
    const { stream, stop } = toneStream();
    const audio = new DelayedAudio(stream, 2000, 1);
    await audio.resume();
    try {
      audio.setDelay(0);
      const samples = await sample(audio, 800);

      expect(samples.every((s) => s.delay === 0 || s.delay === 2)).toBe(true);
      expect(samples.at(-1)!.delay).toBe(0);
      expect(Math.min(...samples.map((s) => s.fade))).toBeLessThan(0.25);
      expect(samples.at(-1)!.fade).toBeGreaterThan(0.95);
    } finally {
      audio.dispose();
      stop();
    }
  }, 20_000);

  it('makes a change that comes during a cut right after it, and ends on the last one', async () => {
    const { stream, stop } = toneStream();
    const audio = new DelayedAudio(stream, 0, 1);
    await audio.resume();
    try {
      audio.setDelay(2000);
      audio.setDelay(1000);
      // The wait is checked every 500 ms by the stream watcher.
      const samples = await sample(audio, 1500);

      expect(samples.at(-1)!.delay).toBe(1);
      expect(samples.at(-1)!.fade).toBeGreaterThan(0.95);
    } finally {
      audio.dispose();
      stop();
    }
  }, 20_000);
});
