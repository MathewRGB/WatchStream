import { describe, expect, it } from 'vitest';
import { readReceiveStats, summarizeReceive, type ReceiveStats } from './receive-stats';

const reading = (overrides: Partial<ReceiveStats> = {}): ReceiveStats => ({
  at: 0,
  packetsReceived: 0,
  packetsLost: 0,
  bytesReceived: 0,
  framesDecoded: 0,
  framesDropped: 0,
  jitterSeconds: 0.01,
  bufferDelaySeconds: 0,
  bufferFrames: 0,
  freezeCount: 0,
  freezeSeconds: 0,
  frameHeight: 720,
  rttMs: 40,
  ...overrides,
});

describe('readReceiveStats', () => {
  it('reads the video the link receives and the round trip of the chosen path', () => {
    const stats = readReceiveStats(
      [
        { type: 'inbound-rtp', kind: 'audio', packetsReceived: 999 },
        {
          type: 'inbound-rtp',
          kind: 'video',
          packetsReceived: 500,
          packetsLost: 5,
          bytesReceived: 400_000,
          framesDecoded: 240,
          jitter: 0.02,
          jitterBufferDelay: 12,
          jitterBufferEmittedCount: 240,
          freezeCount: 1,
          totalFreezesDuration: 0.4,
          frameHeight: 720,
        },
        { type: 'candidate-pair', nominated: true, currentRoundTripTime: 0.18 },
      ],
      1000,
    );

    expect(stats).toMatchObject({
      at: 1000,
      packetsReceived: 500,
      packetsLost: 5,
      framesDecoded: 240,
      freezeCount: 1,
      rttMs: 180,
    });
  });

  it('is null without received video', () => {
    expect(readReceiveStats([{ type: 'inbound-rtp', kind: 'audio' }], 0)).toBeNull();
    expect(readReceiveStats([], 0)).toBeNull();
  });

  it('leaves out what the browser does not report, and counts a negative loss as none', () => {
    const stats = readReceiveStats(
      [{ type: 'inbound-rtp', kind: 'video', packetsReceived: 10, packetsLost: -3 }],
      0,
    )!;

    expect(stats.packetsLost).toBe(0);
    expect(stats.freezeCount).toBeNull();
    expect(stats.bufferDelaySeconds).toBeNull();
    expect(stats.rttMs).toBeNull();
  });
});

describe('summarizeReceive', () => {
  it('turns the change between two readings into rates, a loss share and the buffer delay', () => {
    const report = summarizeReceive(
      reading({ at: 0 }),
      reading({
        at: 2000,
        packetsReceived: 190,
        packetsLost: 10,
        bytesReceived: 500_000,
        framesDecoded: 48,
        jitterSeconds: 0.031,
        bufferDelaySeconds: 9.6,
        bufferFrames: 48,
        freezeCount: 2,
        freezeSeconds: 0.75,
      }),
    );

    expect(report).toEqual({
      loss: 0.05,
      fps: 24,
      kbps: 2000,
      jitterMs: 31,
      bufferMs: 200,
      freezes: 2,
      freezeMs: 750,
      height: 720,
      rttMs: 40,
    });
  });

  it('says nothing about loss from a handful of packets', () => {
    const report = summarizeReceive(
      reading({ at: 0 }),
      reading({ at: 2000, packetsReceived: 5, packetsLost: 5 }),
    );

    expect(report?.loss).toBeNull();
  });

  it('leaves out what it cannot compute', () => {
    const report = summarizeReceive(
      reading({ at: 0, bufferDelaySeconds: null, bufferFrames: null, freezeCount: null }),
      reading({ at: 2000, bufferDelaySeconds: null, bufferFrames: null, freezeCount: null }),
    );

    expect(report).toMatchObject({ bufferMs: null, freezes: null });
  });

  it('is null when the clock stands still or a counter fell', () => {
    expect(summarizeReceive(reading({ at: 5 }), reading({ at: 5 }))).toBeNull();
    expect(
      summarizeReceive(
        reading({ at: 0, framesDecoded: 100 }),
        reading({ at: 2000, framesDecoded: 3 }),
      ),
    ).toBeNull();
  });
});
