import { describe, expect, it } from 'vitest';
import type { LinkStats } from '../peer/link-stats';
import { LOAD_RULES, LoadMonitor, type LoadDecision } from './load-monitor';
import { qualityPreset } from './quality';

const LIMITS = qualityPreset('balanced');

interface Rates {
  /** Frames a second the encoder produces. */
  enc?: number;
  /** Frames a second the source produces. */
  src?: number | null;
  /** Bits a second sent. */
  bps?: number;
  avail?: number | null;
  loss?: number | null;
}

/** Plays out a set of links reading their counters every few seconds, as the host does. */
class Simulation {
  at = 0;
  private totals = new Map<string, { enc: number; src: number; bytes: number }>();

  tick(seconds: number, rates: Record<string, Rates | null>): Map<string, LinkStats | null> {
    this.at += seconds * 1000;
    const readings = new Map<string, LinkStats | null>();
    for (const [id, rate] of Object.entries(rates)) {
      if (rate === null) {
        readings.set(id, null);
        continue;
      }
      const total = this.totals.get(id) ?? { enc: 0, src: 0, bytes: 0 };
      total.enc += (rate.enc ?? 30) * seconds;
      total.src += (rate.src === undefined ? 30 : (rate.src ?? 0)) * seconds;
      total.bytes += ((rate.bps ?? 3_000_000) / 8) * seconds;
      this.totals.set(id, total);
      readings.set(id, {
        at: this.at,
        framesEncoded: total.enc,
        sourceFrames: rate.src === null ? null : total.src,
        bytesSent: total.bytes,
        availableBps: rate.avail ?? null,
        lossFraction: rate.loss ?? null,
        rttMs: 10,
      });
    }
    return readings;
  }
}

function setup() {
  const monitor = new LoadMonitor();
  const sim = new Simulation();
  /** One reading round of `seconds`, with the same rates for the named links. */
  const run = (seconds: number, rates: Record<string, Rates | null>, limits = LIMITS) =>
    monitor.update({ readings: sim.tick(seconds, rates), limits });
  /** Several rounds, two seconds apart. */
  const runFor = (totalSeconds: number, rates: Record<string, Rates | null>) => {
    let last!: LoadDecision;
    for (let t = 0; t < totalSeconds; t += 2) last = run(2, rates);
    return last;
  };
  return { monitor, sim, run, runFor };
}

const links = (count: number, rates: Rates | null = {}) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`v${i + 1}`, rates]));

describe('LoadMonitor when the host keeps up', () => {
  it('reports nothing for minutes', () => {
    const { runFor } = setup();

    const decision = runFor(300, links(6));

    expect(decision).toMatchObject({ struggling: false, cause: null });
    expect([...decision.links.values()]).toEqual(Array(6).fill('good'));
  });

  it('says nothing while no link has a picture', () => {
    const { runFor } = setup();

    const decision = runFor(60, links(3, null));

    expect(decision).toMatchObject({ struggling: false });
    expect(decision.links.size).toBe(0);
  });

  it('does not count a still picture, which produces few frames', () => {
    const { runFor } = setup();

    const decision = runFor(120, links(4, { src: 2, enc: 2, bps: 50_000 }));

    expect(decision.struggling).toBe(false);
  });

  it('does not count a source that produces more than the limit allows', () => {
    const { runFor } = setup();

    // The screen runs at 60 frames a second, the limit is 30: encoding 30 is all that was asked.
    const decision = runFor(120, links(4, { src: 60, enc: 30 }));

    expect(decision.struggling).toBe(false);
  });

  it('cannot judge a link whose browser does not say what the source produced', () => {
    const { runFor } = setup();

    const decision = runFor(120, links(4, { src: null, enc: 3 }));

    expect(decision.struggling).toBe(false);
  });
});

describe('LoadMonitor when the host struggles', () => {
  it('reports it after three bad readings in a row, never in the first seconds', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });

    // A link is first read at 2 s; its first 8 seconds say nothing, so judging starts at 10 s.
    const graceEnds = 2 + LOAD_RULES.graceMs / 1000;
    for (let t = 2; t < graceEnds; t += 2) {
      expect(run(2, bad)).toMatchObject({ struggling: false });
    }
    expect(run(2, bad)).toMatchObject({ struggling: false });
    expect(run(2, bad)).toMatchObject({ struggling: false });
    expect(run(2, bad)).toMatchObject({ struggling: true, cause: 'computer' });
  });

  it('keeps reporting it while the host struggles, and stops once one reading is good', () => {
    const { runFor, run } = setup();

    expect(runFor(60, links(4, { enc: 9 }))).toMatchObject({ struggling: true, cause: 'computer' });
    expect(run(2, links(4))).toMatchObject({ struggling: false, cause: null });
  });

  it('starts counting again when one good reading comes in between', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });
    const good = links(4);
    for (let t = 2; t <= 8; t += 2) run(2, good);

    const reported = [
      run(2, bad),
      run(2, bad),
      run(2, good),
      run(2, bad),
      run(2, bad),
      run(2, good),
    ].map((decision) => decision.struggling);

    expect(reported).toEqual([false, false, false, false, false, false]);
  });

  it('is judged against the limits it is given: fewer frames are fine at a lower frame rate', () => {
    const minimal = qualityPreset('minimal');
    // 15 frames a second is all that Minimal asks for.
    const { monitor, sim: simulation } = setup();
    let decision!: LoadDecision;
    for (let t = 0; t < 120; t += 2) {
      decision = monitor.update({
        readings: simulation.tick(2, links(4, { enc: 15, src: 30 })),
        limits: minimal,
      });
    }

    expect(decision).toMatchObject({ struggling: false });
  });
});

describe('LoadMonitor with one slow viewer among many', () => {
  it('leaves the others alone and marks only that viewer as slow', () => {
    const { runFor } = setup();
    const rates = { ...links(5), v3: { enc: 4 } };

    const decision = runFor(120, rates);

    expect(decision.struggling).toBe(false);
    expect(decision.links.get('v3')).toBe('slow');
    expect([...decision.links].filter(([, health]) => health === 'slow')).toHaveLength(1);
  });

  it.each([
    [1, 1],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [12, 6],
  ])('with %i links the host struggles when %i are affected, not one fewer', (count, needed) => {
    const run = (affected: number) => {
      const { runFor } = setup();
      const rates = Object.fromEntries(
        Array.from({ length: count }, (_, i) => [`v${i}`, i < affected ? { enc: 5 } : {}]),
      );
      return runFor(24, rates).struggling;
    };

    expect(run(needed)).toBe(true);
    if (needed > 1) expect(run(needed - 1)).toBe(false);
  });
});

describe('LoadMonitor and the connection', () => {
  it('counts lost packets on every link as the connection holding the picture back', () => {
    const { runFor } = setup();

    const decision = runFor(30, links(4, { loss: 0.12 }));

    expect(decision).toMatchObject({ struggling: true, cause: 'connection' });
  });

  it('counts a small loss as nothing', () => {
    const { runFor } = setup();

    expect(runFor(120, links(4, { loss: 0.02 })).struggling).toBe(false);
  });

  it('counts an available bitrate far below the cap when the link already sends most of it', () => {
    const { runFor } = setup();

    // Chromium: 1.2 Mbit/s available against a cap of 3.5, and 1.1 of it in use.
    const decision = runFor(30, links(4, { avail: 1_200_000, bps: 1_100_000 }));

    expect(decision).toMatchObject({ struggling: true, cause: 'connection' });
  });

  it('does not count a low estimate on a link that sends little: it cannot climb that way', () => {
    const { runFor } = setup();

    // A quiet picture: 50 kbit/s sent, the estimate has not grown. That is not a bad connection.
    const decision = runFor(120, links(4, { avail: 300_000, bps: 50_000 }));

    expect(decision.struggling).toBe(false);
  });

  it('copes without an available bitrate, as in Firefox', () => {
    const { runFor } = setup();

    expect(runFor(120, links(4, { avail: null })).struggling).toBe(false);
  });
});

describe('LoadMonitor bookkeeping', () => {
  it('skips a round in which a counter fell, as when a sender was replaced', () => {
    const monitor = new LoadMonitor();
    const sim = new Simulation();
    for (let t = 2; t <= 20; t += 2) {
      monitor.update({ readings: sim.tick(2, links(4)), limits: LIMITS });
    }
    const readings = sim.tick(2, links(4));
    for (const [id, stats] of readings) {
      if (stats) readings.set(id, { ...stats, framesEncoded: 0, bytesSent: 0 });
    }

    const decision = monitor.update({ readings, limits: LIMITS });

    expect(decision).toMatchObject({ struggling: false });
  });

  it('forgets a link that has gone, so a new one gets its own grace period', () => {
    const { run, runFor } = setup();
    runFor(30, links(2));

    run(2, { v1: {}, v2: null });
    const next = run(2, { v1: {}, v2: { enc: 2 } });

    expect(next.links.get('v2')).toBe('good');
  });

  it('starts anew after a reset', () => {
    const { monitor, runFor, run } = setup();
    expect(runFor(60, links(4, { enc: 9 })).struggling).toBe(true);

    monitor.reset();

    expect(run(2, links(4))).toMatchObject({ struggling: false, cause: null });
  });
});
