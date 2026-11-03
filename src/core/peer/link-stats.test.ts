import { describe, expect, it } from 'vitest';
import { readLinkStats } from './link-stats';

/** What Chromium reports for a link that sends one picture. */
const CHROMIUM = [
  { type: 'outbound-rtp', kind: 'video', framesEncoded: 93, bytesSent: 32_641 },
  { type: 'outbound-rtp', kind: 'audio', framesEncoded: undefined, bytesSent: 9_000 },
  { type: 'media-source', kind: 'audio', frames: undefined },
  { type: 'media-source', kind: 'video', frames: 97 },
  { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0.02, roundTripTime: 0.012 },
  { type: 'candidate-pair', nominated: true, availableOutgoingBitrate: 3_920_000 },
  { type: 'candidate-pair', nominated: false, availableOutgoingBitrate: 1 },
];

/** What Firefox reports: no available bitrate, the round trip on the candidate pair. */
const FIREFOX = [
  { type: 'outbound-rtp', kind: 'video', framesEncoded: 64, bytesSent: 53_038 },
  { type: 'media-source', kind: 'video', frames: 65 },
  { type: 'remote-inbound-rtp', kind: 'video', fractionLost: 0 },
  { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.004 },
];

describe('readLinkStats', () => {
  it('reads the repair counters and the kinds of the connected path', () => {
    const stats = readLinkStats(
      [
        {
          type: 'outbound-rtp',
          kind: 'video',
          pliCount: 4,
          nackCount: 120,
          keyFramesEncoded: 9,
          retransmittedBytesSent: 54_000,
        },
        { type: 'local-candidate', id: 'L1', candidateType: 'srflx' },
        { type: 'remote-candidate', id: 'R1', candidateType: 'relay' },
        {
          type: 'candidate-pair',
          nominated: true,
          localCandidateId: 'L1',
          remoteCandidateId: 'R1',
        },
      ],
      1,
    );
    expect(stats).toMatchObject({
      pliCount: 4,
      nackCount: 120,
      keyFramesEncoded: 9,
      retransmittedBytes: 54_000,
      path: 'srflx/relay',
    });
  });

  it('has no path when the candidates cannot be told', () => {
    const stats = readLinkStats(
      [
        { type: 'outbound-rtp', kind: 'video' },
        {
          type: 'candidate-pair',
          nominated: true,
          localCandidateId: 'L1',
          remoteCandidateId: 'R1',
        },
      ],
      1,
    );
    expect(stats?.path).toBeNull();
  });

  it('reads why and how the encoder holds the picture back', () => {
    const stats = readLinkStats(
      [
        {
          type: 'outbound-rtp',
          kind: 'video',
          framesEncoded: 1,
          bytesSent: 1,
          qualityLimitationReason: 'bandwidth',
          targetBitrate: 120_000,
          frameHeight: 360,
          framesPerSecond: 22,
        },
      ],
      1,
    );
    expect(stats).toMatchObject({
      limitationReason: 'bandwidth',
      targetBps: 120_000,
      frameHeight: 360,
      framesPerSecond: 22,
    });
  });

  it('reads the numbers of a Chromium link', () => {
    expect(readLinkStats(CHROMIUM, 1000)).toEqual({
      at: 1000,
      framesEncoded: 93,
      sourceFrames: 97,
      bytesSent: 32_641,
      availableBps: 3_920_000,
      lossFraction: 0.02,
      rttMs: 12,
      limitationReason: null,
      targetBps: null,
      frameHeight: null,
      framesPerSecond: null,
      pliCount: null,
      nackCount: null,
      keyFramesEncoded: null,
      retransmittedBytes: null,
      path: null,
    });
  });

  it('copes with what Firefox does not report: no available bitrate, a round trip from the pair', () => {
    expect(readLinkStats(FIREFOX, 5)).toEqual({
      at: 5,
      framesEncoded: 64,
      sourceFrames: 65,
      bytesSent: 53_038,
      availableBps: null,
      lossFraction: 0,
      rttMs: 4,
      limitationReason: null,
      targetBps: null,
      frameHeight: null,
      framesPerSecond: null,
      pliCount: null,
      nackCount: null,
      keyFramesEncoded: null,
      retransmittedBytes: null,
      path: null,
    });
  });

  it('is null while no picture is sent', () => {
    expect(readLinkStats([], 1)).toBeNull();
    expect(
      readLinkStats(
        [
          { type: 'outbound-rtp', kind: 'audio', bytesSent: 5 },
          { type: 'candidate-pair', nominated: true },
        ],
        1,
      ),
    ).toBeNull();
  });

  it('takes the video of a link that also sends sound', () => {
    const stats = readLinkStats(CHROMIUM, 1);

    expect(stats?.framesEncoded).toBe(93);
    expect(stats?.sourceFrames).toBe(97);
  });

  it('leaves out what is missing instead of inventing it', () => {
    const stats = readLinkStats([{ type: 'outbound-rtp', kind: 'video' }], 7);

    expect(stats).toEqual({
      at: 7,
      framesEncoded: 0,
      sourceFrames: null,
      bytesSent: 0,
      availableBps: null,
      lossFraction: null,
      rttMs: null,
      limitationReason: null,
      targetBps: null,
      frameHeight: null,
      framesPerSecond: null,
      pliCount: null,
      nackCount: null,
      keyFramesEncoded: null,
      retransmittedBytes: null,
      path: null,
    });
  });

  it('ignores numbers that are not numbers', () => {
    const stats = readLinkStats(
      [
        { type: 'outbound-rtp', kind: 'video', framesEncoded: 5, bytesSent: Number.NaN },
        { type: 'candidate-pair', nominated: true, availableOutgoingBitrate: 'fast' },
      ],
      1,
    );

    expect(stats).toMatchObject({ framesEncoded: 5, bytesSent: 0, availableBps: null });
  });

  it('takes the pair that is in use, not one that is not', () => {
    const stats = readLinkStats(
      [
        { type: 'outbound-rtp', kind: 'video', framesEncoded: 1 },
        { type: 'candidate-pair', nominated: false, availableOutgoingBitrate: 111 },
        { type: 'candidate-pair', nominated: true, availableOutgoingBitrate: 222 },
      ],
      1,
    );

    expect(stats?.availableBps).toBe(222);
  });
});
