import { describe, expect, it } from 'vitest';
import type { LoadStatus } from '@/core/session/host-session';
import { describeLoad } from './describe-load';

const status = (overrides: Partial<LoadStatus> = {}): LoadStatus => ({
  chosen: 'balanced',
  effective: 'balanced',
  viewers: 8,
  cause: null,
  overloaded: false,
  health: new Map(),
  ...overrides,
});

describe('describeLoad', () => {
  it('says what is sent and to how many while all is well', () => {
    expect(describeLoad(status())).toEqual({ tone: 'normal', text: '720p · 8 viewers' });
  });

  it('says "viewer" for one', () => {
    expect(describeLoad(status({ viewers: 1, chosen: 'sharp', effective: 'sharp' })).text).toBe(
      '1080p · 1 viewer',
    );
  });

  it('names the step it was lowered to, and the computer as the reason', () => {
    expect(describeLoad(status({ effective: 'saver', cause: 'computer' }))).toEqual({
      tone: 'lowered',
      text: 'Lowered to Saver (480p · 8 viewers): your computer is busy.',
    });
  });

  it('names the connection as the reason when that is it', () => {
    expect(describeLoad(status({ effective: 'minimal', cause: 'connection' }))).toEqual({
      tone: 'lowered',
      text: 'Lowered to Minimal (360p · 8 viewers): your connection cannot keep up.',
    });
  });

  it('warns that some viewers may get the picture late when nothing more can be lowered', () => {
    expect(
      describeLoad(status({ effective: 'minimal', cause: 'computer', overloaded: true })),
    ).toEqual({
      tone: 'overloaded',
      text: '360p · 8 viewers: your computer cannot keep up. Some viewers may get the picture late.',
    });
  });

  it('blames the connection in the warning when it is the connection', () => {
    expect(describeLoad(status({ overloaded: true, cause: 'connection' })).text).toContain(
      'your connection cannot keep up',
    );
  });

  it('assumes the computer when the cause is not known', () => {
    expect(describeLoad(status({ effective: 'saver' })).text).toContain('your computer is busy');
  });
});
