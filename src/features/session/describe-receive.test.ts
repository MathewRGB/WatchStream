import { describe, expect, it } from 'vitest';
import type { ReceiveReport } from '@/core/peer/receive-stats';
import { describeReceive } from './describe-receive';

const good: ReceiveReport = {
  loss: 0.001,
  fps: 29.6,
  kbps: 2300,
  jitterMs: 8,
  bufferMs: 90,
  freezes: 0,
  freezeMs: 0,
  height: 720,
  rttMs: 40,
};

describe('describeReceive', () => {
  it('lists what arrives and finds nothing wrong with a good picture', () => {
    expect(describeReceive(good)).toEqual({
      text: '720p · 30 fps · 2.3 Mbit/s · 0.1 % lost · 90 ms wait · 40 ms round trip',
      problem: null,
    });
  });

  it('leaves out what the browser did not report', () => {
    const line = describeReceive({
      ...good,
      loss: null,
      bufferMs: null,
      freezes: null,
      rttMs: null,
    });

    expect(line.text).toBe('720p · 30 fps · 2.3 Mbit/s');
  });

  it('names loss first, because a lower quality helps against it', () => {
    const line = describeReceive({ ...good, loss: 0.06, bufferMs: 900, freezes: 3 });

    expect(line.problem).toMatch(/lost/);
    expect(line.text).toContain('6.0 % lost');
    expect(line.text).toContain('3 freezes');
  });

  it('blames a long way when the wait is long and the round trip is too', () => {
    expect(describeReceive({ ...good, bufferMs: 600, rttMs: 320 }).problem).toMatch(/long/);
  });

  it('blames the viewer side when the wait is long on a short way', () => {
    expect(describeReceive({ ...good, bufferMs: 600, rttMs: 30 }).problem).toMatch(/viewer side/);
  });

  it('notes a freeze that has no other cause', () => {
    const line = describeReceive({ ...good, freezes: 1 });

    expect(line.problem).toMatch(/froze/);
    expect(line.text).toContain('1 freeze');
  });
});
