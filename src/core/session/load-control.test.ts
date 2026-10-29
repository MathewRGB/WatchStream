import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkStats } from '../peer/link-stats';
import { LoadControl } from './load-control';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A link whose encoder keeps `encodes` of every `produced` frames; `round` counts the readings. */
function link() {
  let round = 0;
  let encodes = 30;
  return {
    behind() {
      encodes = 10;
    },
    stats: vi.fn(async (): Promise<LinkStats> => {
      round += 1;
      return {
        at: round * 2000,
        framesEncoded: round * 2 * encodes,
        sourceFrames: round * 2 * 30,
        bytesSent: round * 750_000,
        availableBps: null,
        lossFraction: null,
        rttMs: 5,
      };
    }),
  };
}

function control(links: Map<string, ReturnType<typeof link>>) {
  const onReading = vi.fn();
  const load = new LoadControl({
    intervalMs: 2000,
    chosen: () => 'balanced',
    links: () => links,
    onReading,
  });
  return { load, onReading };
}

describe('LoadControl', () => {
  it('reads nothing before it is started and after it is stopped', async () => {
    const a = link();
    const { load } = control(new Map([['a', a]]));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(a.stats).not.toHaveBeenCalled();

    load.start();
    await vi.advanceTimersByTimeAsync(4_000);
    load.stop();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(a.stats).toHaveBeenCalledTimes(2);
  });

  it('reports that the host struggles when every link is behind, and keeps the chosen quality', async () => {
    const a = link();
    const { load } = control(new Map([['a', a]]));
    a.behind();

    load.start();
    for (let i = 0; i < 20 && !load.status(1).struggling; i++) {
      await vi.advanceTimersByTimeAsync(2000);
    }

    expect(load.status(1)).toMatchObject({
      chosen: 'balanced',
      struggling: true,
      cause: 'computer',
    });
    expect(load.status(1).health.get('a')).toBe('slow');
  });

  it('starts over on reset: nobody slow, and not struggling', async () => {
    const a = link();
    const { load } = control(new Map([['a', a]]));
    a.behind();
    load.start();
    await vi.advanceTimersByTimeAsync(30_000);

    load.reset();

    expect(load.status(1)).toMatchObject({ chosen: 'balanced', struggling: false, cause: null });
    expect(load.status(1).health.size).toBe(0);
  });

  it('drops a reading that was under way when it was reset', async () => {
    let finish: (stats: LinkStats | null) => void = () => {};
    const slow = { stats: () => new Promise<LinkStats | null>((resolve) => (finish = resolve)) };
    const onReading = vi.fn();
    const load = new LoadControl({
      intervalMs: 2000,
      chosen: () => 'balanced',
      links: () => new Map([['a', slow]]),
      onReading,
    });
    load.start();
    await vi.advanceTimersByTimeAsync(2000);

    load.reset();
    finish(null);
    await vi.advanceTimersByTimeAsync(0);

    expect(onReading).not.toHaveBeenCalled();
    load.stop();
  });

  it('does not read while there is no link to read', async () => {
    const { load, onReading } = control(new Map());

    load.start();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(onReading).not.toHaveBeenCalled();
    load.stop();
  });

  it('forgets a link that has gone', async () => {
    const a = link();
    const { load } = control(new Map([['a', a]]));
    a.behind();
    load.start();
    await vi.advanceTimersByTimeAsync(30_000);

    load.forget('a');

    expect(load.status(0).health.has('a')).toBe(false);
    load.stop();
  });
});
