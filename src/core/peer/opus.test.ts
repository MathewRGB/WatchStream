import { describe, expect, it } from 'vitest';
import { tuneOpus } from './opus';

const sdp = (...audioLines: string[]) =>
  ['v=0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111 63', ...audioLines, 'a=sendrecv', ''].join('\r\n');

describe('tuneOpus', () => {
  it('adds stereo and a music bitrate to an existing format line, keeping what is there', () => {
    const tuned = tuneOpus(
      sdp('a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10;useinbandfec=0;usedtx=1'),
    );

    expect(tuned).toContain('a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1;');
    expect(tuned).toContain('stereo=1');
    expect(tuned).toContain('sprop-stereo=1');
    expect(tuned).toContain('maxaveragebitrate=320000');
  });

  it('creates the format line when there is none', () => {
    const tuned = tuneOpus(sdp('a=rtpmap:111 opus/48000/2'));

    expect(tuned.split('\r\n')).toContain(
      'a=fmtp:111 stereo=1;sprop-stereo=1;maxaveragebitrate=320000;useinbandfec=1',
    );
  });

  it('puts a new format line right after its rtpmap line', () => {
    const lines = tuneOpus(sdp('a=rtpmap:111 opus/48000/2', 'a=rtpmap:63 red/48000/2')).split(
      '\r\n',
    );

    expect(lines[lines.indexOf('a=rtpmap:111 opus/48000/2') + 1]).toMatch(/^a=fmtp:111 stereo=1/);
  });

  it('leaves other codecs alone', () => {
    const description = sdp('a=rtpmap:63 red/48000/2', 'a=fmtp:63 111/111');

    expect(tuneOpus(description)).toBe(description);
  });

  it('leaves a description without audio unchanged', () => {
    const description = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\n';

    expect(tuneOpus(description)).toBe(description);
  });

  it('is stable when applied twice', () => {
    const once = tuneOpus(sdp('a=rtpmap:111 opus/48000/2', 'a=fmtp:111 minptime=10'));

    expect(tuneOpus(once)).toBe(once);
  });
});
