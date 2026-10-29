import { describe, expect, it } from 'vitest';
import type { LinkStats } from '../../src/core/peer/link-stats';
import type { MediaLink } from '../../src/core/peer/message-link';
import type { SharedMedia, ViewerSession } from '../../src/core/session/viewer-session';
import { createTestStream, createTestStreamWithAudio, join, startHost, waitFor } from './helpers';

/** The encoder settings the browser really holds, read from the host's RTCRtpSenders. */
function videoEncodings(host: ReturnType<typeof startHost>) {
  const links = (host as unknown as { viewers: Map<string, { link: { senders: RTCRtpSender[] } }> })
    .viewers;
  return [...links.values()].flatMap(({ link }) =>
    link.senders
      .filter((sender) => sender.track?.kind === 'video')
      .flatMap((sender) => sender.getParameters().encodings ?? []),
  );
}

type HostLink = { senders: RTCRtpSender[]; connection: RTCPeerConnection };

function hostLinks(host: ReturnType<typeof startHost>): HostLink[] {
  const viewers = (host as unknown as { viewers: Map<string, { link: HostLink }> }).viewers;
  return [...viewers.values()].map(({ link }) => link);
}

/** Bits per second the host really sends as audio, measured over `ms`. */
async function audioBitrate(host: ReturnType<typeof startHost>, ms: number): Promise<number> {
  const sender = hostLinks(host)[0]!.senders.find((s) => s.track?.kind === 'audio')!;
  const bytes = async () => {
    const stats = await sender.getStats();
    let sent = 0;
    stats.forEach((report) => {
      if (report.type === 'outbound-rtp') sent = report.bytesSent;
    });
    return sent;
  };
  const before = await bytes();
  await new Promise((resolve) => setTimeout(resolve, ms));
  return (((await bytes()) - before) * 8) / (ms / 1000);
}

/** The audio encoder limit the browser really holds. */
function audioBitrateLimit(host: ReturnType<typeof startHost>): number | undefined {
  return hostLinks(host)[0]!
    .senders.find((sender) => sender.track?.kind === 'audio')
    ?.getParameters().encodings?.[0]?.maxBitrate;
}

function nextMedia(session: ViewerSession) {
  return waitFor<SharedMedia | null>((resolve) => {
    const off = session.events.on('media', (media) => {
      off();
      resolve(media);
    });
  });
}

/** True once the picture really plays: it has a size and its clock advances. */
async function plays(stream: MediaStream): Promise<boolean> {
  const video = document.createElement('video');
  video.muted = true;
  video.srcObject = stream;
  document.body.append(video);
  try {
    await video.play();
    await waitFor<void>((resolve) => {
      const check = () => (video.videoWidth > 0 ? resolve() : setTimeout(check, 50));
      check();
    }, 10_000);
    const start = video.currentTime;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return video.currentTime > start;
  } finally {
    video.remove();
  }
}

describe('sharing over WebRTC', () => {
  it('sends the host stream to a connected viewer, who can play it', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);

    host.startSharing(createTestStream());

    const media = await arrived;
    expect(media?.sourceId).toBe(host.hostId);
    expect(media?.stream.getVideoTracks()).toHaveLength(1);
    expect(await plays(media!.stream)).toBe(true);
  });

  it('sends the stream to every viewer', async () => {
    const host = startHost();
    const user2 = await join(host, 'user2');
    const user3 = await join(host, 'user3');
    const arrivals = [nextMedia(user2), nextMedia(user3)];

    host.startSharing(createTestStream());

    const [first, second] = await Promise.all(arrivals);
    expect(await plays(first!.stream)).toBe(true);
    expect(await plays(second!.stream)).toBe(true);
  });

  it('sends the stream to six viewers at once, all of whom can play it', async () => {
    const host = startHost();
    const viewers: ViewerSession[] = [];
    for (let i = 1; i <= 6; i++) viewers.push(await join(host, `viewer${i}`));
    const arrivals = viewers.map(nextMedia);

    host.startSharing(createTestStream());

    const media = await Promise.all(arrivals);
    for (const shared of media) expect(await plays(shared!.stream)).toBe(true);
  }, 60_000);

  it('shares with a viewer who joins while the host is already sharing', async () => {
    const host = startHost();
    host.startSharing(createTestStream());

    const late = await join(host, 'user2');
    const media = late.media ?? (await nextMedia(late));

    expect(await plays(media!.stream)).toBe(true);
  });

  it('tells the viewer when the host stops sharing', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStream());
    await arrived;
    const stopped = nextMedia(viewer);

    host.stopSharing();

    expect(await stopped).toBeNull();
    expect(viewer.media).toBeNull();
  });

  it('shares again after a stop', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const first = nextMedia(viewer);
    host.startSharing(createTestStream());
    await first;
    const stopped = nextMedia(viewer);
    host.stopSharing();
    await stopped;
    const second = nextMedia(viewer);

    host.startSharing(createTestStream());

    expect(await plays((await second)!.stream)).toBe(true);
  });

  it('limits what the browser sends, now and when the preset changes', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStreamWithAudio());
    await arrived;

    await waitFor<void>((resolve) => {
      const check = () =>
        videoEncodings(host)[0]?.maxBitrate === 3_500_000 ? resolve() : setTimeout(check, 50);
      check();
    });
    expect(videoEncodings(host)[0]).toMatchObject({ maxBitrate: 3_500_000, maxFramerate: 30 });
    expect(audioBitrateLimit(host)).toBe(128_000);

    host.setQuality('saver');

    await waitFor<void>((resolve) => {
      const check = () =>
        videoEncodings(host)[0]?.maxBitrate === 1_500_000 ? resolve() : setTimeout(check, 50);
      check();
    });
    expect(videoEncodings(host)[0]).toMatchObject({ maxBitrate: 1_500_000, maxFramerate: 24 });
    expect(audioBitrateLimit(host)).toBe(64_000);
  });

  it('sends the sound in stereo at a music-grade bitrate', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStreamWithAudio());
    await arrived;
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const bitrate = await audioBitrate(host, 3000);

    // Opus' default for voice is about 32 kbit/s; music needs several times that.
    expect(bitrate).toBeGreaterThan(90_000);
    expect(bitrate).toBeLessThan(160_000);
    const negotiated = hostLinks(host)[0]!.connection.remoteDescription!.sdp;
    expect(negotiated).toMatch(/a=fmtp:\d+ [^\r\n]*stereo=1/);
  });
});

describe('the load monitor over WebRTC', () => {
  it('leaves the quality alone for a host that keeps up, as the real statistics show it', async () => {
    // Every real counter of both browsers goes through the monitor: a false alarm here would be one
    // for every host. A second a reading, so that the 8 s of grace and three readings are over.
    const host = startHost({ monitorIntervalMs: 1000 });
    const viewers = [await join(host, 'user2'), await join(host, 'user3')];
    const arrivals = viewers.map(nextMedia);
    host.startSharing(createTestStream());
    await Promise.all(arrivals);
    const statuses: string[] = [];
    host.events.on('load', (status) => statuses.push(`${status.struggling}/${status.cause}`));

    await new Promise((resolve) => setTimeout(resolve, 14_000));

    // Positive control: the monitor read both links, or "nothing slow" would say nothing.
    expect(host.load.health.size).toBe(2);
    expect(host.quality).toBe('balanced');
    expect(host.load).toMatchObject({ struggling: false, cause: null });
    expect([...host.load.health.values()]).toEqual(['good', 'good']);
    expect(statuses.filter((s) => s !== 'false/null')).toEqual([]);
  }, 40_000);

  it('applies a chosen quality to the encoder of every sender', async () => {
    const host = startHost();
    for (const name of ['user2', 'user3', 'user4']) await join(host, name);
    host.startSharing(createTestStream());

    host.setQuality('minimal');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const encodings = videoEncodings(host);
    expect(encodings).toHaveLength(3);
    for (const encoding of encodings) {
      expect(encoding.maxBitrate).toBe(600_000);
      expect(encoding.maxFramerate).toBe(15);
    }
  }, 30_000);
});

describe('statistics of a link over WebRTC', () => {
  it('counts the frames encoded and produced and the bytes sent, and is null when it cannot', async () => {
    const host = startHost();
    await join(host, 'user2');
    const link = hostLinks(host)[0] as unknown as MediaLink;
    expect(await link.stats()).toBeNull();

    host.startSharing(createTestStream());
    const first = await waitFor<LinkStats>((resolve) => {
      const poll = async () => {
        const stats = await link.stats();
        if (stats && stats.framesEncoded > 5) resolve(stats);
        else setTimeout(() => void poll(), 200);
      };
      void poll();
    }, 15_000);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const second = (await link.stats())!;

    expect(second.at).toBeGreaterThan(first.at);
    expect(second.framesEncoded).toBeGreaterThan(first.framesEncoded);
    expect(second.bytesSent).toBeGreaterThan(first.bytesSent);
    // Both browsers say how many frames the source produced; the monitor compares with it.
    expect(second.sourceFrames).toBeGreaterThan(first.sourceFrames!);
    expect(second.lossFraction === null || second.lossFraction >= 0).toBe(true);
    // Only Chromium has an available bitrate; the other browser leaves it out.
    expect(second.availableBps === null || second.availableBps > 0).toBe(true);

    host.close();
    expect(await link.stats()).toBeNull();
  }, 30_000);
});
