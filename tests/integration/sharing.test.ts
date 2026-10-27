import { describe, expect, it } from 'vitest';
import type { SharedMedia, ViewerSession } from '../../src/core/session/viewer-session';
import { createTestStream, join, startHost, waitFor } from './helpers';

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
    host.startSharing(createTestStream());
    await arrived;

    await waitFor<void>((resolve) => {
      const check = () =>
        videoEncodings(host)[0]?.maxBitrate === 3_500_000 ? resolve() : setTimeout(check, 50);
      check();
    });
    expect(videoEncodings(host)[0]).toMatchObject({ maxBitrate: 3_500_000, maxFramerate: 30 });

    host.setQuality('saver');

    await waitFor<void>((resolve) => {
      const check = () =>
        videoEncodings(host)[0]?.maxBitrate === 1_500_000 ? resolve() : setTimeout(check, 50);
      check();
    });
    expect(videoEncodings(host)[0]).toMatchObject({ maxBitrate: 1_500_000, maxFramerate: 24 });
  });
});
