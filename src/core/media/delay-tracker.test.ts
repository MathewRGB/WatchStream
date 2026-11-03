import { describe, expect, it } from 'vitest';
import { AudioDelayTracker, MAX_AUDIO_DELAY_MS, type PlayoutCounters } from './delay-tracker';

/** Counters for a receiver whose units have waited `waitMs` each, `units` more than before. */
const counter = (total: { s: number; n: number }, waitMs: number, units: number) => {
  total.s += (waitMs / 1000) * units;
  total.n += units;
  return { delaySeconds: total.s, emitted: total.n };
};

function feed(videoWaitMs: number, audioWaitMs: number, rounds: number): number | null {
  const tracker = new AudioDelayTracker();
  const v = { s: 0, n: 0 };
  const a = { s: 0, n: 0 };
  let result: number | null = null;
  for (let i = 0; i < rounds; i += 1) {
    const counters: PlayoutCounters = {
      video: counter(v, videoWaitMs, 30),
      audio: counter(a, audioWaitMs, 48_000),
    };
    result = tracker.update(counters);
  }
  return result;
}

describe('AudioDelayTracker', () => {
  it('knows nothing from the first reading alone', () => {
    expect(feed(2000, 10, 1)).toBeNull();
  });

  it('delays the sound by what the picture waits more than the sound does', () => {
    expect(feed(2000, 10, 4)).toBe(1990);
  });

  it('follows a picture buffer that is larger than the target asked for', () => {
    expect(feed(2900, 150, 12)).toBe(2750);
  });

  it('moves slowly when the picture buffer changes', () => {
    const tracker = new AudioDelayTracker();
    const v = { s: 0, n: 0 };
    const a = { s: 0, n: 0 };
    const round = (videoWait: number) =>
      tracker.update({ video: counter(v, videoWait, 30), audio: counter(a, 10, 48_000) });
    round(1000);
    for (let i = 0; i < 5; i += 1) round(1000);
    const after = round(3000);

    expect(after).toBeGreaterThan(1000);
    expect(after).toBeLessThan(2500);
  });

  it('never asks for more than the graph can hold, nor for less than nothing', () => {
    expect(feed(9000, 0, 6)).toBe(MAX_AUDIO_DELAY_MS);
    expect(feed(10, 500, 6)).toBe(0);
  });

  it('starts over when the receiver was replaced', () => {
    const tracker = new AudioDelayTracker();
    const v = { s: 0, n: 0 };
    const a = { s: 0, n: 0 };
    for (let i = 0; i < 4; i += 1) {
      tracker.update({ video: counter(v, 2000, 30), audio: counter(a, 10, 48_000) });
    }
    const fresh = { s: 0, n: 0 };
    const freshAudio = { s: 0, n: 0 };
    tracker.update({ video: counter(fresh, 500, 30), audio: counter(freshAudio, 10, 48_000) });
    const next = tracker.update({
      video: counter(fresh, 500, 30),
      audio: counter(freshAudio, 10, 48_000),
    });

    expect(next).toBe(490);
  });

  it('keeps the last value while the picture is too still to average', () => {
    const tracker = new AudioDelayTracker();
    const v = { s: 0, n: 0 };
    const a = { s: 0, n: 0 };
    tracker.update({ video: counter(v, 2000, 30), audio: counter(a, 10, 48_000) });
    const known = tracker.update({ video: counter(v, 2000, 30), audio: counter(a, 10, 48_000) });
    const still = tracker.update({ video: counter(v, 2000, 1), audio: counter(a, 10, 48_000) });

    expect(still).toBe(known);
  });

  it('is null without any counters', () => {
    expect(new AudioDelayTracker().update(null)).toBeNull();
  });
});
