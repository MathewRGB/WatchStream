import { describe, expect, it } from 'vitest';
import { parsePcmMessage } from './relay';

const block = (frames = 2048) => new Float32Array(frames);

describe('parsePcmMessage', () => {
  it('accepts a stereo block', () => {
    const message = { kind: 'pcm', sampleRate: 48_000, channels: [block(), block()] };
    expect(parsePcmMessage(message)).toEqual(message);
  });

  it('accepts a mono block', () => {
    expect(
      parsePcmMessage({ kind: 'pcm', sampleRate: 44_100, channels: [block()] }),
    ).not.toBeNull();
  });

  it.each([
    ['not an object', 'pcm'],
    ['null', null],
    ['another kind', { kind: 'hello', sampleRate: 48_000, channels: [block()] }],
    [
      'a sample rate that is not a number',
      { kind: 'pcm', sampleRate: '48000', channels: [block()] },
    ],
    ['a sample rate that is too low', { kind: 'pcm', sampleRate: 100, channels: [block()] }],
    ['a sample rate that is too high', { kind: 'pcm', sampleRate: 1e6, channels: [block()] }],
    ['no channels', { kind: 'pcm', sampleRate: 48_000, channels: [] }],
    ['three channels', { kind: 'pcm', sampleRate: 48_000, channels: [block(), block(), block()] }],
    ['an empty block', { kind: 'pcm', sampleRate: 48_000, channels: [block(0)] }],
    ['a huge block', { kind: 'pcm', sampleRate: 48_000, channels: [block(1e6)] }],
    [
      'channels of different length',
      { kind: 'pcm', sampleRate: 48_000, channels: [block(10), block(20)] },
    ],
    ['plain arrays as samples', { kind: 'pcm', sampleRate: 48_000, channels: [[0, 0, 0]] }],
  ])('rejects %s', (_name, raw) => {
    expect(parsePcmMessage(raw)).toBeNull();
  });
});
