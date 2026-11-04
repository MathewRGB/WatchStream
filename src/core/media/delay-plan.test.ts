import { describe, expect, it } from 'vitest';
import { JUMP_FROM_SECONDS, MAX_SLEW, MIN_CHANGE_SECONDS, planDelayChange } from './delay-plan';

describe('planDelayChange', () => {
  it('does nothing for a change nobody could tell', () => {
    expect(planDelayChange(1, 1)).toEqual({ kind: 'none' });
    expect(planDelayChange(1, 1 + MIN_CHANGE_SECONDS / 2)).toEqual({ kind: 'none' });
  });

  it('glides a small correction at the slew limit, up or down', () => {
    const up = planDelayChange(1, 1.2);
    const down = planDelayChange(1.2, 1);

    expect(up).toEqual({ kind: 'glide', seconds: expect.closeTo(0.2 / MAX_SLEW, 6) });
    expect(down).toEqual(up);
  });

  it('never glides faster than the slew limit would read the sound backwards or at triple speed', () => {
    for (const change of [0.01, 0.1, 0.2, JUMP_FROM_SECONDS]) {
      const plan = planDelayChange(0, change);
      expect(plan.kind).toBe('glide');
      if (plan.kind === 'glide') expect(change / plan.seconds).toBeLessThanOrEqual(MAX_SLEW + 1e-9);
    }
  });

  it('cuts between two fades for a change the viewer made', () => {
    expect(planDelayChange(0, 1)).toEqual({ kind: 'jump' });
    expect(planDelayChange(0, 2)).toEqual({ kind: 'jump' });
    expect(planDelayChange(2, 0)).toEqual({ kind: 'jump' });
    expect(planDelayChange(1, 2)).toEqual({ kind: 'jump' });
  });
});
