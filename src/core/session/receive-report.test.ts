import { describe, expect, it, vi } from 'vitest';
import { serialize } from '../protocol/messages';
import type { ReceiveStats } from '../peer/receive-stats';
import type { FakeLink } from '../testing/fake-network';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';

const stream = () => new MediaStream(['video'] as unknown as MediaStreamTrack[]);

/** Counters of a picture that arrives well: 30 frames and 100 packets in every 2 seconds. */
function arriving(link: FakeLink): { reads: () => number } {
  let reads = 0;
  link.receiveStats = async (): Promise<ReceiveStats> => {
    reads++;
    return {
      at: reads * 2000,
      packetsReceived: reads * 100,
      packetsLost: reads * 5,
      bytesReceived: reads * 500_000,
      framesDecoded: reads * 60,
      framesDropped: 0,
      jitterSeconds: 0.02,
      bufferDelaySeconds: reads * 6,
      bufferFrames: reads * 60,
      freezeCount: 0,
      freezeSeconds: 0,
      frameHeight: 720,
      rttMs: 150,
    };
  };
  return { reads: () => reads };
}

async function room() {
  const { host, network } = createHost();
  const { viewer, participant } = await joinViewer(host, network, 'viewer', {
    reportIntervalMs: 5,
  });
  return { host, viewer, id: participant.id, viewerLink: network.answers[0]! };
}

describe('receive reports', () => {
  it('reach the host from a viewer who shows the picture', async () => {
    const { host, id, viewerLink } = await room();
    arriving(viewerLink);
    const onReports = vi.fn();
    host.events.on('receiveReports', onReports);

    host.startSharing(stream());

    await vi.waitFor(() => expect(host.receiveReports.get(id)).toBeDefined());
    expect(host.receiveReports.get(id)).toEqual({
      loss: 0.048,
      fps: 30,
      kbps: 2000,
      jitterMs: 20,
      bufferMs: 100,
      freezes: 0,
      freezeMs: 0,
      height: 720,
      rttMs: 150,
    });
    expect(onReports).toHaveBeenCalled();
  });

  it('end with the picture: the host forgets them and the viewer stops reading', async () => {
    const { host, id, viewerLink } = await room();
    const picture = arriving(viewerLink);
    host.startSharing(stream());
    await vi.waitFor(() => expect(host.receiveReports.get(id)).toBeDefined());

    host.stopSharing();
    await flush();
    const reads = picture.reads();
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(host.receiveReports.size).toBe(0);
    expect(picture.reads()).toBe(reads);
  });

  it('are forgotten when the viewer leaves', async () => {
    const { host, viewer, id, viewerLink } = await room();
    arriving(viewerLink);
    host.startSharing(stream());
    await vi.waitFor(() => expect(host.receiveReports.get(id)).toBeDefined());

    viewer.leave();
    await flush();

    expect(host.receiveReports.has(id)).toBe(false);
  });

  it('are not sent when the browser has nothing to read', async () => {
    const { host, viewerLink } = await room();
    const sent = vi.spyOn(viewerLink, 'send');
    viewerLink.receiveStats = async () => null;

    host.startSharing(stream());
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(sent.mock.calls.filter(([raw]) => raw.includes('receive-report'))).toEqual([]);
    expect(host.receiveReports.size).toBe(0);
  });

  it('are dropped by the host while nothing is shared', async () => {
    const { host, viewerLink } = await room();

    viewerLink.send(
      serialize({
        type: 'receive-report',
        report: {
          loss: 0,
          fps: 30,
          kbps: 1000,
          jitterMs: 1,
          bufferMs: 1,
          freezes: 0,
          freezeMs: 0,
          height: 720,
          rttMs: 1,
        },
      }),
    );
    await flush();

    expect(host.receiveReports.size).toBe(0);
  });
});
