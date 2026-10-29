import { describe, expect, it } from 'vitest';
import { preferVideoCodecs } from './video-codecs';

const codec = (mimeType: string, sdpFmtpLine = '') => ({ mimeType, sdpFmtpLine });

describe('preferVideoCodecs', () => {
  it('puts H.264 first, then VP8, and keeps the rest in the browser order', () => {
    const ordered = preferVideoCodecs([
      codec('video/VP8'),
      codec('video/VP9'),
      codec('video/AV1'),
      codec('video/H264'),
      codec('video/rtx'),
    ]);

    expect(ordered.map((c) => c.mimeType)).toEqual([
      'video/H264',
      'video/VP8',
      'video/VP9',
      'video/AV1',
      'video/rtx',
    ]);
  });

  it('keeps the browser order between H.264 profiles', () => {
    const ordered = preferVideoCodecs([
      codec('video/VP8'),
      codec('video/H264', 'profile-level-id=42e01f'),
      codec('video/H264', 'profile-level-id=640c1f'),
    ]);

    expect(ordered.map((c) => c.sdpFmtpLine)).toEqual([
      'profile-level-id=42e01f',
      'profile-level-id=640c1f',
      '',
    ]);
  });

  it('removes nothing and does not change its input', () => {
    const input = [codec('video/VP8'), codec('video/H264')];
    const ordered = preferVideoCodecs(input);

    expect(ordered).toHaveLength(2);
    expect(input[0]!.mimeType).toBe('video/VP8');
  });
});
