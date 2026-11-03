import { describe, expect, it } from 'vitest';
import { applyBitrateHints, bitrateHints, degradationFor } from './weak-link';

const SDP = [
  'v=0',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111',
  'a=rtpmap:111 opus/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98',
  'a=rtpmap:96 VP9/90000',
  'a=fmtp:96 profile-id=0',
  'a=rtpmap:97 rtx/90000',
  'a=fmtp:97 apt=96',
  'a=rtpmap:98 VP8/90000',
  '',
].join('\r\n');

describe('weak link behaviour', () => {
  it('maps each mode to a degradation preference', () => {
    expect(degradationFor('smooth')).toBe('maintain-framerate');
    expect(degradationFor('balanced')).toBe('balanced');
    expect(degradationFor('steady')).toBe('maintain-resolution');
  });

  it('asks for a floor only in the steady mode, as shares of the cap', () => {
    expect(bitrateHints('smooth', 3_500_000)).toBeNull();
    expect(bitrateHints('balanced', 3_500_000)).toBeNull();
    expect(bitrateHints('steady', 3_500_000)).toEqual({ minKbps: 1400, startKbps: 2450 });
    expect(bitrateHints('steady', 100_000)).toEqual({ minKbps: 150, startKbps: 150 });
  });

  it('writes the hints into video codecs only, and replaces earlier ones', () => {
    const hints = { minKbps: 800, startKbps: 1500 };
    const once = applyBitrateHints(SDP, hints);
    expect(once).toContain(
      'a=fmtp:96 profile-id=0;x-google-min-bitrate=800;x-google-start-bitrate=1500',
    );
    expect(once).toContain('a=fmtp:98 x-google-min-bitrate=800;x-google-start-bitrate=1500');
    expect(once).toContain('a=fmtp:97 apt=96\r\n');
    expect(once).not.toMatch(/a=fmtp:111/);
    expect(applyBitrateHints(once, { minKbps: 400, startKbps: 600 })).toContain(
      'a=fmtp:96 profile-id=0;x-google-min-bitrate=400;x-google-start-bitrate=600\r\n',
    );
  });

  it('leaves the description alone without hints', () => {
    expect(applyBitrateHints(SDP, null)).toBe(SDP);
  });
});
