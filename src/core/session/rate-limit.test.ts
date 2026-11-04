import { describe, expect, it } from 'vitest';
import { RateLimit } from './rate-limit';

describe('RateLimit', () => {
  it('lets the limit through within the window and refuses the rest', () => {
    let now = 0;
    const limit = new RateLimit(3, 1_000, () => now);

    const results = [0, 100, 200, 300].map((time) => {
      now = time;
      return limit.allow();
    });

    expect(results).toEqual([true, true, true, false]);
  });

  it('lets events through again once the window has moved on', () => {
    let now = 0;
    const limit = new RateLimit(2, 1_000, () => now);
    limit.allow();
    now = 500;
    limit.allow();
    now = 600;
    expect(limit.allow()).toBe(false);

    now = 1_000;
    expect(limit.allow()).toBe(true);
    expect(limit.allow()).toBe(false);
  });

  it('does not count an event it refused', () => {
    let now = 0;
    const limit = new RateLimit(1, 1_000, () => now);
    limit.allow();
    now = 900;
    limit.allow();

    now = 1_000;

    expect(limit.allow()).toBe(true);
  });
});
