import { describe, expect, it } from 'vitest';
import type { LinkStats } from '../../src/core/peer/link-stats';
import type { MediaLink } from '../../src/core/peer/message-link';
import type { ReceiveReport } from '../../src/core/peer/receive-stats';
import { detectAutoCodec } from '../../src/core/peer/video-codecs';
import { MAX_SDP_LENGTH } from '../../src/core/peer/session-description';
import type { SharedMedia, ViewerSession } from '../../src/core/session/viewer-session';
import {
  createNoisyStreamWithAudio,
  createTestStream,
  createTestStreamWithAudio,
  join,
  startHost,
  waitFor,
} from './helpers';

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

/** Resolves once no negotiation is under way any more. */
function waitForStable(connection: RTCPeerConnection) {
  return waitFor<void>((resolve) => {
    const check = () =>
      connection.signalingState === 'stable' ? resolve() : setTimeout(check, 50);
    // The offer for a change comes a moment after the change.
    setTimeout(check, 200);
  }, 8000);
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

  it('shares again and again over one link: the description does not grow', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const sizes: number[] = [];
    let media: SharedMedia | null = null;

    for (let round = 0; round < 6; round += 1) {
      const arrived = nextMedia(viewer);
      host.startSharing(createTestStreamWithAudio());
      media = await arrived;
      await waitForStable(hostLinks(host)[0]!.connection);
      sizes.push(hostLinks(host)[0]!.connection.localDescription!.sdp.length);
      if (round === 5) break;
      const stopped = nextMedia(viewer);
      host.stopSharing();
      await stopped;
      await waitForStable(hostLinks(host)[0]!.connection);
    }

    // A message over `MAX_SDP_LENGTH` is dropped, and the link then never negotiates again.
    expect(Math.max(...sizes)).toBeLessThan(sizes[0]! * 1.5);
    expect(await plays(media!.stream)).toBe(true);
    expect(media!.stream.getVideoTracks()).toHaveLength(1);
    expect(media!.stream.getAudioTracks()).toHaveLength(1);
  }, 60_000);

  it('passes the stage between the host and a viewer again and again over one link', async () => {
    const host = startHost();
    const sharer = await join(host, 'sharer');
    const watcher = await join(host, 'watcher');

    for (let round = 0; round < 3; round += 1) {
      // The viewer asks and shares; the other viewer gets the picture through the host.
      const forwarded = nextMedia(watcher);
      sharer.requestShare(createTestStreamWithAudio());
      await waitFor<void>((resolve) => {
        const poll = () => (host.shareRequests.length > 0 ? resolve() : setTimeout(poll, 20));
        poll();
      });
      host.allowShare(sharer.participantId!);
      const viaHost = (await forwarded)!;
      expect(viaHost.sourceId).toBe(sharer.participantId);

      // The host's own share takes the stage back, and the two offers cross on the sharer's link.
      const ended = nextMedia(watcher);
      const own = waitFor<SharedMedia | null>((resolve) => {
        const off = sharer.events.on('media', (media) => {
          off();
          resolve(media);
        });
      }, 10_000);
      host.startSharing(createTestStreamWithAudio());
      expect(await ended).toBeNull();
      expect((await own)?.sourceId).toBe(host.hostId);
      expect(await plays((await own)!.stream)).toBe(true);

      const stopped = nextMedia(sharer);
      host.stopSharing();
      await stopped;
      for (const link of hostLinks(host)) await waitForStable(link.connection);
    }

    expect(host.participants).toHaveLength(3);
    for (const link of hostLinks(host)) {
      expect(link.connection.localDescription!.sdp.length).toBeLessThan(MAX_SDP_LENGTH);
    }
  }, 90_000);

  it('asks for music-grade sound in every share, not only the first', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const first = nextMedia(viewer);
    host.startSharing(createTestStreamWithAudio());
    await first;
    const stopped = nextMedia(viewer);
    host.stopSharing();
    await stopped;
    const second = nextMedia(viewer);

    host.startSharing(createTestStreamWithAudio());
    await second;
    await waitForStable(hostLinks(host)[0]!.connection);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(await audioBitrate(host, 3000)).toBeGreaterThan(90_000);
  }, 40_000);

  it('reads the counters of the picture that runs now, not of an earlier share', async () => {
    const host = startHost({ monitorIntervalMs: 500 });
    const viewer = await join(host, 'user2');
    const first = nextMedia(viewer);
    host.startSharing(createTestStream());
    await first;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const stopped = nextMedia(viewer);
    host.stopSharing();
    await stopped;
    await waitForStable(hostLinks(host)[0]!.connection);
    const second = nextMedia(viewer);

    host.startSharing(createTestStream());
    const media = (await second)!;
    expect(await plays(media.stream)).toBe(true);

    await waitFor<void>((resolve) => {
      const poll = () => ((host.load.sendingBps ?? 0) > 0 ? resolve() : setTimeout(poll, 100));
      poll();
    }, 10_000);
    const report = await waitFor<ReceiveReport>((resolve) => {
      const poll = () => {
        const current = host.receiveReports.get(viewer.participantId!);
        if (current?.fps) resolve(current);
        else setTimeout(poll, 100);
      };
      poll();
    }, 10_000);
    expect(report.fps).toBeGreaterThan(0);
  }, 40_000);

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

  it('sends the values a host sets itself, and asks the capture for the frame rate that is sent', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const second = await join(host, 'user3');
    const stream = createTestStreamWithAudio();
    const asked: unknown[] = [];
    stream.getVideoTracks()[0]!.applyConstraints = async (constraints) => {
      asked.push(constraints?.frameRate);
    };
    const arrived = Promise.all([nextMedia(viewer), nextMedia(second)]);
    host.startSharing(stream);
    await arrived;
    await waitFor<void>((resolve) => {
      const check = () => (asked.length > 0 ? resolve() : setTimeout(check, 20));
      check();
    });

    host.setCustomQuality({
      maxHeight: 360,
      maxFramerate: 15,
      maxBitrateBps: 1_000_000,
      maxAudioBitrateBps: 96_000,
    });

    await waitFor<void>((resolve) => {
      const check = () =>
        videoEncodings(host).length === 2 &&
        videoEncodings(host).every((e) => e.maxBitrate === 1_000_000 && e.maxFramerate === 15)
          ? resolve()
          : setTimeout(check, 50);
      check();
    });
    expect(videoEncodings(host)).toHaveLength(2);
    for (const encoding of videoEncodings(host)) {
      expect(encoding).toMatchObject({ maxBitrate: 1_000_000, maxFramerate: 15 });
    }
    expect(audioBitrateLimit(host)).toBe(96_000);
    // Once for each frame rate that was chosen, and not once for each viewer.
    expect(asked).toEqual([{ ideal: 30 }, { ideal: 15 }]);
  }, 30_000);

  it('really sends no more than the bitrates the host set, and more once they are raised', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createNoisyStreamWithAudio());
    await arrived;
    const sender = (kind: string) =>
      hostLinks(host)[0]!.senders.find((s) => s.track?.kind === kind)!;
    const rate = async (kind: string, ms: number) => {
      const bytes = async () => {
        let sent = 0;
        (await sender(kind).getStats()).forEach((report) => {
          if (report.type === 'outbound-rtp') sent = report.bytesSent;
        });
        return sent;
      };
      const before = await bytes();
      await new Promise((resolve) => setTimeout(resolve, ms));
      return (((await bytes()) - before) * 8) / (ms / 1000);
    };

    host.setCustomQuality({
      maxHeight: 360,
      maxFramerate: 30,
      maxBitrateBps: 500_000,
      maxAudioBitrateBps: 32_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const lowVideo = await rate('video', 3000);
    const lowAudio = await rate('audio', 3000);
    expect(lowVideo).toBeLessThan(500_000 * 1.25);
    expect(lowAudio).toBeLessThan(32_000 * 1.25);

    host.setCustomQuality({ maxBitrateBps: 3_000_000, maxAudioBitrateBps: 256_000 });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    // The sound follows its limit at once, in both browsers (up to the highest one on offer).
    expect(await rate('audio', 3000)).toBeGreaterThan(200_000);
    // Chromium also takes the new picture limit within seconds; Firefox's estimate of the
    // connection climbs slowly after a fall, so its picture is not asked here.
    if (!/firefox/i.test(navigator.userAgent)) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      expect(await rate('video', 3000)).toBeGreaterThan(lowVideo * 2.5);
    }
  }, 60_000);

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

describe('viewer reports over WebRTC', () => {
  it('tell the host how the picture arrives, as the viewer measures it', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStream());
    const media = (await arrived)!;
    // A picture that nothing shows is not decoded.
    expect(await plays(media.stream)).toBe(true);

    const report = await waitFor<ReceiveReport>((resolve) => {
      const poll = () => {
        const current = host.receiveReports.get(viewer.participantId!);
        if (current && current.fps !== null && current.fps > 0) resolve(current);
        else setTimeout(poll, 250);
      };
      poll();
    }, 20_000);

    expect(report.fps).toBeGreaterThan(0);
    expect(report.kbps).toBeGreaterThan(0);
    expect(report.height).toBeGreaterThan(0);
    expect(report.loss === null || (report.loss >= 0 && report.loss <= 1)).toBe(true);

    host.stopSharing();
    await waitFor<void>((resolve) => {
      const poll = () => (host.receiveReports.size === 0 ? resolve() : setTimeout(poll, 100));
      poll();
    }, 5_000);
  }, 40_000);
});

/** The codec the host's video sender really encodes with, e.g. `video/VP9`. */
async function sentCodec(link: HostLink): Promise<string | null> {
  const sender = link.senders.find((s) => s.track?.kind === 'video');
  if (!sender) return null;
  const reports = [...(await sender.getStats()).values()] as Array<Record<string, unknown>>;
  const outbound = reports.find((r) => r.type === 'outbound-rtp' && r.kind === 'video');
  const codec = reports.find((r) => r.type === 'codec' && r.id === outbound?.codecId);
  return typeof codec?.mimeType === 'string' ? codec.mimeType : null;
}

/** The smoothing buffer the viewer's receivers hold, per kind. */
function playoutTargets(viewer: ViewerSession): Array<[string | undefined, unknown]> {
  const link = (viewer as unknown as { link: { connection: RTCPeerConnection } }).link;
  return link.connection
    .getReceivers()
    .map((receiver) => [
      receiver.track?.kind,
      (receiver as { jitterBufferTarget?: unknown }).jitterBufferTarget,
    ]);
}

describe.skipIf(!('jitterBufferTarget' in RTCRtpReceiver.prototype))(
  'the viewer smoothing buffer over WebRTC',
  () => {
    it('reaches the receivers of the shared stream', async () => {
      const host = startHost();
      const viewer = await join(host, 'user2');
      viewer.setPlayoutBuffer('medium');
      const arrived = nextMedia(viewer);
      host.startSharing(createTestStream());
      const media = (await arrived)!;
      expect(await plays(media.stream)).toBe(true);

      const targets = playoutTargets(viewer);
      // The test stream carries a picture only; every receiver that exists gets the target.
      expect(targets.map(([kind]) => kind)).toContain('video');
      expect(targets.every(([, target]) => target === 2000)).toBe(true);

      viewer.setPlayoutBuffer('standard');
      expect(playoutTargets(viewer).every(([, target]) => target === null)).toBe(true);
    }, 40_000);
  },
);

// Firefox takes no codec preference (it keeps VP8 first), so the choice is a Chromium matter.
describe.skipIf(/firefox/i.test(navigator.userAgent))('the codec choice over WebRTC', () => {
  it('changes the codec that is really sent, also while sharing, and the picture keeps playing', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStream());
    const media = (await arrived)!;
    expect(await plays(media.stream)).toBe(true);
    const link = hostLinks(host)[0]!;
    // Automatic is VP9 where this browser has no hardware H.264 encoder, else H.264.
    const automatic = (await detectAutoCodec()) === 'vp9' ? 'video/VP9' : 'video/H264';
    await waitFor<void>((resolve) => {
      const poll = async () =>
        (await sentCodec(link)) === automatic ? resolve() : setTimeout(() => void poll(), 250);
      void poll();
    }, 15_000);

    host.setCodec('vp8');

    await waitFor<void>((resolve) => {
      const poll = async () =>
        (await sentCodec(link)) === 'video/VP8' ? resolve() : setTimeout(() => void poll(), 250);
      void poll();
    }, 15_000);
    expect(await plays(media.stream)).toBe(true);
  }, 40_000);

  it('applies the weak-connection mode to the sender, and the steady floor, the default, keeps the picture playing', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStream());
    const media = (await arrived)!;
    expect(await plays(media.stream)).toBe(true);
    const link = hostLinks(host)[0]!;
    const preference = () =>
      link.senders.find((s) => s.track?.kind === 'video')?.getParameters().degradationPreference;
    await waitFor<void>((resolve) => {
      const poll = () => (preference() === 'maintain-resolution' ? resolve() : setTimeout(poll, 100));
      poll();
    }, 10_000);

    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await plays(media.stream)).toBe(true);

    // Dropping the floor travels in a new negotiation while the picture is sent.
    host.setWeakLink('balanced');

    await waitFor<void>((resolve) => {
      const poll = () => (preference() === 'balanced' ? resolve() : setTimeout(poll, 100));
      poll();
    }, 10_000);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(await plays(media.stream)).toBe(true);
    expect(host.participants).toHaveLength(2);
  }, 40_000);

  it('keeps the viewer and the picture when codec and quality are changed again and again', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = nextMedia(viewer);
    host.startSharing(createTestStream());
    const media = (await arrived)!;
    expect(await plays(media.stream)).toBe(true);

    const codecs = ['vp9', 'vp8', 'h264', 'av1', 'auto'] as const;
    const qualities = ['minimal', 'sharp', 'saver', 'balanced'] as const;
    for (let i = 0; i < 20; i++) {
      host.setCodec(codecs[i % codecs.length]!);
      host.setQuality(qualities[i % qualities.length]!);
      // Some changes come in a burst, some a moment apart.
      if (i % 3 === 0) await new Promise((resolve) => setTimeout(resolve, 150));
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(viewer.state).toBe('connected');
    expect(host.participants).toHaveLength(2);
    expect(await plays(media.stream)).toBe(true);
  }, 60_000);
});
