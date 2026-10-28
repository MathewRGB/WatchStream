import { describe, expect, it } from 'vitest';
import type { LinkStats } from '../peer/link-stats';
import { LOAD_RULES, LoadMonitor, type LoadDecision } from './load-monitor';
import { qualityPreset } from './quality';

const LIMITS = qualityPreset('balanced');
const STEPS = 3;

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

function setup(stepsAvailable = STEPS) {
  const monitor = new LoadMonitor();
  const sim = new Simulation();
  const decisions: LoadDecision[] = [];
  /** One reading round of `seconds`, with the same rates for the named links. */
  const run = (seconds: number, rates: Record<string, Rates | null>, limits = LIMITS) => {
    const decision = monitor.update({
      readings: sim.tick(seconds, rates),
      limits,
      stepsAvailable,
    });
    decisions.push(decision);
    return decision;
  };
  /** Several rounds, two seconds apart. */
  const runFor = (totalSeconds: number, rates: Record<string, Rates | null>) => {
    let last!: LoadDecision;
    for (let t = 0; t < totalSeconds; t += 2) last = run(2, rates);
    return last;
  };
  return { monitor, sim, run, runFor, decisions };
}

const links = (count: number, rates: Rates | null = {}) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [`v${i + 1}`, rates]));

describe('LoadMonitor when the host keeps up', () => {
  it('leaves the quality alone for minutes', () => {
    const { runFor } = setup();

    const decision = runFor(300, links(6));

    expect(decision).toMatchObject({ penalty: 0, struggling: false, overloaded: false });
    expect([...decision.links.values()]).toEqual(Array(6).fill('good'));
  });

  it('says nothing while no link has a picture', () => {
    const { runFor } = setup();

    const decision = runFor(60, links(3, null));

    expect(decision).toMatchObject({ penalty: 0, struggling: false });
    expect(decision.links.size).toBe(0);
  });

  it('does not count a still picture, which produces few frames', () => {
    const { runFor } = setup();

    const decision = runFor(120, links(4, { src: 2, enc: 2, bps: 50_000 }));

    expect(decision.penalty).toBe(0);
  });

  it('does not count a source that produces more than the limit allows', () => {
    const { runFor } = setup();

    // The screen runs at 60 frames a second, the limit is 30: encoding 30 is all that was asked.
    const decision = runFor(120, links(4, { src: 60, enc: 30 }));

    expect(decision.penalty).toBe(0);
  });

  it('cannot judge a link whose browser does not say what the source produced', () => {
    const { runFor } = setup();

    const decision = runFor(120, links(4, { src: null, enc: 3 }));

    expect(decision.penalty).toBe(0);
  });
});

describe('LoadMonitor when the host struggles', () => {
  it('lowers the quality one step after three bad readings in a row, never in the first seconds', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });

    // A link is first read at 2 s; its first 8 seconds say nothing, so judging starts at 10 s.
    const graceEnds = 2 + LOAD_RULES.graceMs / 1000;
    for (let t = 2; t < graceEnds; t += 2) {
      expect(run(2, bad)).toMatchObject({ penalty: 0, struggling: false });
    }
    expect(run(2, bad)).toMatchObject({ penalty: 0, struggling: true });
    expect(run(2, bad)).toMatchObject({ penalty: 0, struggling: true });
    expect(run(2, bad)).toMatchObject({ penalty: 1, cause: 'computer' });
  });

  it('goes on step by step, waiting ten seconds between steps, and stops at the lowest', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });
    const penalties: number[] = [];
    let overloadedAt = -1;
    for (let t = 2; t <= 80; t += 2) {
      const decision = run(2, bad);
      if (penalties.at(-1) !== decision.penalty) penalties.push(decision.penalty);
      if (decision.overloaded && overloadedAt < 0) overloadedAt = t;
    }

    expect(penalties).toEqual([0, 1, 2, 3]);
    expect(overloadedAt).toBeGreaterThan(0);
  });

  it('is overloaded, and says so, when the lowest step is not enough', () => {
    const { runFor } = setup(0);

    const decision = runFor(40, links(4, { enc: 4 }));

    expect(decision).toMatchObject({ penalty: 0, struggling: true, overloaded: true });
  });

  it('waits ten seconds after a change before it takes the next step', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });
    let stepAt = 0;
    for (let t = 2; t <= 60; t += 2) {
      const decision = run(2, bad);
      if (decision.penalty === 1 && stepAt === 0) stepAt = t;
      if (decision.penalty === 2) {
        expect(t - stepAt).toBeGreaterThanOrEqual(LOAD_RULES.waitAfterChangeMs / 1000);
        return;
      }
    }
    throw new Error('never went to the second step');
  });

  it('starts counting again when one good reading comes in between', () => {
    const { run } = setup();
    const bad = links(4, { enc: 9 });
    const good = links(4);
    for (let t = 2; t <= 8; t += 2) run(2, good);

    expect(run(2, bad).penalty).toBe(0);
    expect(run(2, bad).penalty).toBe(0);
    expect(run(2, good).penalty).toBe(0);
    expect(run(2, bad).penalty).toBe(0);
    expect(run(2, bad).penalty).toBe(0);
    expect(run(2, good).penalty).toBe(0);
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
        stepsAvailable: 0,
      });
    }

    expect(decision).toMatchObject({ penalty: 0, struggling: false });
  });

  it('never goes lower than the steps there are when the host picks a lower quality', () => {
    const monitor = new LoadMonitor();
    const sim = new Simulation();
    let decision!: LoadDecision;
    for (let t = 2; t <= 60; t += 2) {
      decision = monitor.update({
        readings: sim.tick(2, links(4, { enc: 9 })),
        limits: LIMITS,
        stepsAvailable: 3,
      });
    }
    expect(decision.penalty).toBe(3);

    decision = monitor.update({
      readings: sim.tick(2, links(4, { enc: 9 })),
      limits: LIMITS,
      stepsAvailable: 1,
    });

    expect(decision.penalty).toBe(1);
  });
});

describe('LoadMonitor with one slow viewer among many', () => {
  it('leaves the others alone and marks only that viewer as slow', () => {
    const { runFor } = setup();
    const rates = { ...links(5), v3: { enc: 4 } };

    const decision = runFor(120, rates);

    expect(decision.penalty).toBe(0);
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

    expect(decision.penalty).toBeGreaterThan(0);
    expect(decision.cause).toBe('connection');
  });

  it('counts a small loss as nothing', () => {
    const { runFor } = setup();

    expect(runFor(120, links(4, { loss: 0.02 })).penalty).toBe(0);
  });

  it('counts an available bitrate far below the cap when the link already sends most of it', () => {
    const { runFor } = setup();

    // Chromium: 1.2 Mbit/s available against a cap of 3.5, and 1.1 of it in use.
    const decision = runFor(30, links(4, { avail: 1_200_000, bps: 1_100_000 }));

    expect(decision.penalty).toBeGreaterThan(0);
    expect(decision.cause).toBe('connection');
  });

  it('does not count a low estimate on a link that sends little: it cannot climb that way', () => {
    const { runFor } = setup();

    // A quiet picture: 50 kbit/s sent, the estimate has not grown. That is not a bad connection.
    const decision = runFor(120, links(4, { avail: 300_000, bps: 50_000 }));

    expect(decision.penalty).toBe(0);
  });

  it('copes without an available bitrate, as in Firefox', () => {
    const { runFor } = setup();

    expect(runFor(120, links(4, { avail: null })).penalty).toBe(0);
  });
});

describe('LoadMonitor recovering', () => {
  it('goes back up one step only after ninety calm seconds, and again after ninety more', () => {
    const { runFor, run } = setup();
    runFor(60, links(4, { enc: 9 }));
    expect(run(2, links(4, { enc: 9 })).penalty).toBeGreaterThanOrEqual(2);
    const lowest = run(2, links(4, { enc: 9 })).penalty;

    const calm = links(4);
    let stepsUp = 0;
    let last = lowest;
    let secondsToFirst = 0;
    let secondsToSecond = 0;
    let seconds = 0;
    while (seconds < 400 && last > 0) {
      seconds += 2;
      const penalty = run(2, calm).penalty;
      if (penalty < last) {
        stepsUp += 1;
        if (stepsUp === 1) secondsToFirst = seconds;
        if (stepsUp === 2) secondsToSecond = seconds - secondsToFirst;
        last = penalty;
      }
    }

    expect(last).toBe(0);
    expect(secondsToFirst).toBeGreaterThanOrEqual(LOAD_RULES.calmMs / 1000);
    expect(secondsToSecond).toBeGreaterThanOrEqual(LOAD_RULES.calmMs / 1000);
  });

  it('does not go up while the host struggles again, and goes down again', () => {
    const { run, runFor } = setup();
    runFor(40, links(4, { enc: 9 }));
    const before = run(2, links(4, { enc: 9 })).penalty;

    runFor(60, links(4));
    runFor(60, links(4, { enc: 9 }));
    const after = run(2, links(4, { enc: 9 })).penalty;

    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('is not held back by one viewer who stays slow', () => {
    const { runFor } = setup();
    runFor(40, links(4, { enc: 9 }));
    const rates = { ...links(5), v2: { enc: 3 } };

    // From the third step down, three calm stretches of ninety seconds bring it back to the top.
    const decision = runFor(300, rates);

    expect(decision.penalty).toBe(0);
    expect(decision.links.get('v2')).toBe('slow');
  });
});

describe('LoadMonitor bookkeeping', () => {
  it('skips a round in which a counter fell, as when a sender was replaced', () => {
    const monitor = new LoadMonitor();
    const sim = new Simulation();
    for (let t = 2; t <= 20; t += 2) {
      monitor.update({ readings: sim.tick(2, links(4)), limits: LIMITS, stepsAvailable: STEPS });
    }
    const readings = sim.tick(2, links(4));
    for (const [id, stats] of readings) {
      if (stats) readings.set(id, { ...stats, framesEncoded: 0, bytesSent: 0 });
    }

    const decision = monitor.update({ readings, limits: LIMITS, stepsAvailable: STEPS });

    expect(decision).toMatchObject({ struggling: false, penalty: 0 });
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
    runFor(40, links(4, { enc: 9 }));
    expect(run(2, links(4, { enc: 9 })).penalty).toBeGreaterThan(0);

    monitor.reset();

    expect(run(2, links(4)).penalty).toBe(0);
  });
});
