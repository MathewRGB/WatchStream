import { describe, expect, it } from 'vitest';
import type { LinkStats } from '../peer/link-stats';
import { SendRate } from './send-rate';

/** A reading of a link that has sent `kilobytes` in all, at `seconds` on its clock. */
const reading = (seconds: number, kilobytes: number): LinkStats => ({
  at: seconds * 1000,
  framesEncoded: 0,
  sourceFrames: null,
  bytesSent: kilobytes * 1000,
  availableBps: null,
  lossFraction: null,
  rttMs: null,
});

describe('SendRate', () => {
  it('knows nothing from one reading, and the rate from the change between two', () => {
    const rate = new SendRate();

    rate.update(new Map([['a', reading(2, 100)]]));
    expect(rate.bps).toBeNull();

    // 250 kB in 2 s: 1 Mbit/s.
    rate.update(new Map([['a', reading(4, 350)]]));
    expect(rate.bps).toBe(1_000_000);
  });

  it('is the mean over the links', () => {
    const rate = new SendRate();
    rate.update(
      new Map([
        ['a', reading(2, 0)],
        ['b', reading(2, 0)],
      ]),
    );

    rate.update(
      new Map([
        ['a', reading(4, 250)],
        ['b', reading(4, 750)],
      ]),
    );

    expect(rate.bps).toBe(2_000_000);
  });

  it('smooths a picture whose bitrate jumps about, half of each new reading', () => {
    const rate = new SendRate();
    rate.update(new Map([['a', reading(2, 0)]]));
    rate.update(new Map([['a', reading(4, 250)]]));

    rate.update(new Map([['a', reading(6, 750)]]));

    // 2 Mbit/s was read; with 1 Mbit/s before it, 1.5.
    expect(rate.bps).toBe(1_500_000);
  });

  it('skips a link whose counter fell, whose reading came too soon, or who has no picture yet', () => {
    const rate = new SendRate();
    rate.update(
      new Map([
        ['a', reading(2, 1000)],
        ['b', reading(2, 0)],
        ['c', null],
      ]),
    );

    rate.update(
      new Map([
        ['a', reading(4, 10)],
        ['b', reading(2.2, 5000)],
        ['c', null],
      ]),
    );

    expect(rate.bps).toBeNull();
  });

  it('counts the links that can be read and leaves the rest out', () => {
    const rate = new SendRate();
    rate.update(
      new Map([
        ['a', reading(2, 0)],
        ['b', reading(2, 0)],
      ]),
    );

    rate.update(
      new Map([
        ['a', reading(4, 250)],
        ['b', reading(4, 250)],
      ]),
    );
    // `b` is replaced by a new sender: its counter starts over. Only `a` is read, at 2 Mbit/s,
    // and counts for half against the 1 Mbit/s before.
    rate.update(
      new Map([
        ['a', reading(6, 750)],
        ['b', reading(6, 10)],
      ]),
    );

    expect(rate.bps).toBe(1_500_000);
  });

  it('forgets everything when no link has a picture any more', () => {
    const rate = new SendRate();
    rate.update(new Map([['a', reading(2, 0)]]));
    rate.update(new Map([['a', reading(4, 250)]]));

    rate.update(new Map([['a', null]]));

    expect(rate.bps).toBeNull();
  });

  it('starts over on reset, and forgets a link that has gone', () => {
    const rate = new SendRate();
    rate.update(new Map([['a', reading(2, 0)]]));
    rate.update(new Map([['a', reading(4, 250)]]));

    rate.reset();
    expect(rate.bps).toBeNull();

    rate.update(new Map([['a', reading(6, 400)]]));
    rate.forget('a');
    rate.update(new Map([['a', reading(8, 900)]]));
    expect(rate.bps).toBeNull();
  });
});
