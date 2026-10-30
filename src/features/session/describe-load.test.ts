import { describe, expect, it } from 'vitest';
import { qualityPreset } from '@/core/media/quality';
import type { LoadStatus } from '@/core/session/host-session';
import { describeLoad } from './describe-load';

const status = (overrides: Partial<LoadStatus> = {}): LoadStatus => ({
  chosen: 'balanced',
  limits: qualityPreset('balanced'),
  viewers: 8,
  struggling: false,
  cause: null,
  health: new Map(),
  ...overrides,
});

describe('describeLoad', () => {
  it('says what is sent and to how many while all is well', () => {
    expect(describeLoad(status())).toEqual({ tone: 'normal', text: '720p · 30 fps · 8 viewers' });
  });

  it('says "viewer" for one', () => {
    expect(
      describeLoad(status({ viewers: 1, chosen: 'sharp', limits: qualityPreset('sharp') })).text,
    ).toBe('1080p · 30 fps · 1 viewer');
  });

  it('says the computer cannot keep up, and that some viewers may get the picture late', () => {
    expect(describeLoad(status({ struggling: true, cause: 'computer' }))).toEqual({
      tone: 'struggling',
      text: '720p · 30 fps · 8 viewers: your computer cannot keep up. Some viewers may get the picture late.',
    });
  });

  it('blames the connection when that is the cause', () => {
    expect(describeLoad(status({ struggling: true, cause: 'connection' })).text).toContain(
      'your connection cannot keep up',
    );
  });

  it('keeps the chosen quality in the line, whatever the host struggles with', () => {
    expect(
      describeLoad(
        status({
          chosen: 'saver',
          limits: qualityPreset('saver'),
          struggling: true,
          cause: 'computer',
        }),
      ).text,
    ).toBe(
      '480p · 24 fps · 8 viewers: your computer cannot keep up. Some viewers may get the picture late.',
    );
  });

  it('shows the values of a custom choice, also a frame rate above 30', () => {
    const custom = {
      chosen: 'custom',
      limits: { ...qualityPreset('sharp'), maxFramerate: 60 },
    } as const;

    expect(describeLoad(status({ ...custom, viewers: 2 })).text).toBe('1080p · 60 fps · 2 viewers');
  });
});
