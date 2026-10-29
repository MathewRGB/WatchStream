import { describe, expect, it } from 'vitest';
import { availableCodecOptions, preferVideoCodecs } from './video-codecs';

const codec = (mimeType: string, sdpFmtpLine = '') => ({ mimeType, sdpFmtpLine });

const browser = [
  codec('video/VP8'),
  codec('video/VP9'),
  codec('video/AV1'),
  codec('video/H264'),
  codec('video/rtx'),
];

const kinds = (list: { mimeType: string }[]) => list.map((c) => c.mimeType);

describe('preferVideoCodecs', () => {
  it('puts H.264 first, then VP8, and keeps the rest in the browser order', () => {
    expect(kinds(preferVideoCodecs(browser))).toEqual([
      'video/H264',
      'video/VP8',
      'video/VP9',
      'video/AV1',
      'video/rtx',
    ]);
  });

  it('puts the chosen codec first and still offers H.264 and VP8 behind it', () => {
    expect(kinds(preferVideoCodecs(browser, 'vp9'))).toEqual([
      'video/VP9',
      'video/H264',
      'video/VP8',
      'video/AV1',
      'video/rtx',
    ]);
    expect(kinds(preferVideoCodecs(browser, 'av1'))[0]).toBe('video/AV1');
    expect(kinds(preferVideoCodecs(browser, 'vp8'))).toEqual([
      'video/VP8',
      'video/H264',
      'video/VP9',
      'video/AV1',
      'video/rtx',
    ]);
  });

  it('copes with a codec the browser does not have', () => {
    expect(kinds(preferVideoCodecs([codec('video/VP8'), codec('video/H264')], 'av1'))).toEqual([
      'video/H264',
      'video/VP8',
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
    const ordered = preferVideoCodecs(input, 'vp9');

    expect(ordered).toHaveLength(2);
    expect(input[0]!.mimeType).toBe('video/VP8');
  });
});

describe('availableCodecOptions', () => {
  it('offers automatic and each codec the browser lists, and no other', () => {
    const ids = availableCodecOptions([
      codec('video/VP8'),
      codec('video/H264'),
      codec('video/rtx'),
    ]);

    expect(ids.map((o) => o.id)).toEqual(['auto', 'h264', 'vp8']);
  });

  it('offers VP9 and AV1 when they are listed', () => {
    expect(availableCodecOptions(browser).map((o) => o.id)).toEqual([
      'auto',
      'h264',
      'vp9',
      'vp8',
      'av1',
    ]);
  });

  it('offers nothing where the browser lists no codecs', () => {
    expect(availableCodecOptions(undefined)).toEqual([]);
    expect(availableCodecOptions([])).toEqual([]);
  });
});
