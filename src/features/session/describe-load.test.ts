import { describe, expect, it } from 'vitest';
import type { LoadStatus } from '@/core/session/host-session';
import { describeLoad } from './describe-load';

const status = (overrides: Partial<LoadStatus> = {}): LoadStatus => ({
  chosen: 'balanced',
  viewers: 8,
  struggling: false,
  cause: null,
  health: new Map(),
  ...overrides,
});

describe('describeLoad', () => {
  it('says what is sent and to how many while all is well', () => {
    expect(describeLoad(status())).toEqual({ tone: 'normal', text: '720p · 8 viewers' });
  });

  it('says "viewer" for one', () => {
    expect(describeLoad(status({ viewers: 1, chosen: 'sharp' })).text).toBe('1080p · 1 viewer');
  });

  it('says the computer cannot keep up, and that some viewers may get the picture late', () => {
    expect(describeLoad(status({ struggling: true, cause: 'computer' }))).toEqual({
      tone: 'struggling',
      text: '720p · 8 viewers: your computer cannot keep up. Some viewers may get the picture late.',
    });
  });

  it('blames the connection when that is the cause', () => {
    expect(describeLoad(status({ struggling: true, cause: 'connection' })).text).toContain(
      'your connection cannot keep up',
    );
  });

  it('keeps the chosen quality in the line, whatever the host struggles with', () => {
    expect(
      describeLoad(status({ chosen: 'saver', struggling: true, cause: 'computer' })).text,
    ).toBe(
      '480p · 8 viewers: your computer cannot keep up. Some viewers may get the picture late.',
    );
  });
});
