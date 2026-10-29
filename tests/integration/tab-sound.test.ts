import { describe, expect, it } from 'vitest';
import { newCaptureState, startCapture, type RelayPort } from '../../src/core/tab-sound/capture';
import { parsePcmMessage } from '../../src/core/tab-sound/relay';
import { TabSoundSink } from '../../src/core/tab-sound/sink';
import { cleanupAfterTest, createTestStream, join, startHost, waitFor } from './helpers';

/** A WAV file with a loud stereo tone, so a page can have a video-like element that plays. */
function toneUrl(): string {
  const rate = 48_000;
  const frames = rate * 2;
  const view = new DataView(new ArrayBuffer(44 + frames * 4));
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * 4, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 0.6 * 32767);
    view.setInt16(44 + i * 4, sample, true);
    view.setInt16(46 + i * 4, sample, true);
  }
  return URL.createObjectURL(new Blob([view], { type: 'audio/wav' }));
}

async function playingElement(): Promise<HTMLAudioElement> {
  const element = document.createElement('audio');
  element.src = toneUrl();
  element.loop = true;
  document.body.append(element);
  await element.play();
  cleanupAfterTest(() => {
    element.pause();
    element.remove();
  });
  return element;
}

/** The sink end of a port that is just a function call: what the extension port carries. */
function portInto(sink: TabSoundSink): RelayPort {
  return {
    postMessage: (message) => {
      const parsed = parsePcmMessage(message);
      if (parsed) sink.push(parsed);
    },
    disconnect: () => undefined,
    onDisconnect: { addListener: () => undefined },
  };
}

/** The loudest sample the track delivers within `timeoutMs`; 0 for silence. */
async function loudest(track: MediaStreamTrack, timeoutMs = 6000): Promise<number> {
  const context = new AudioContext();
  cleanupAfterTest(() => void context.close());
  context.resume().catch(() => undefined);
  const analyser = context.createAnalyser();
  context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const deadline = Date.now() + timeoutMs;
  let peak = 0;
  while (Date.now() < deadline && peak < 0.05) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    analyser.getFloatTimeDomainData(samples);
    peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  }
  return peak;
}

describe('tab sound', () => {
  it('reports that its audio context runs', async () => {
    const sink = new TabSoundSink();
    cleanupAfterTest(() => sink.close());
    expect(await sink.running(3000)).toBe(true);
  });

  it('turns the sound of a playing element into a live track', async () => {
    await playingElement();
    const sink = new TabSoundSink();
    cleanupAfterTest(() => sink.close());
    const stop = newCaptureState();

    expect(startCapture(document, stop, () => portInto(sink))).toBe(true);

    expect(await loudest(sink.track)).toBeGreaterThan(0.05);
  });

  it('can be started again on the same element and stopping it does not silence the element', async () => {
    const element = await playingElement();
    const state = newCaptureState();
    const first = new TabSoundSink();
    const second = new TabSoundSink();
    cleanupAfterTest(() => {
      first.close();
      second.close();
    });

    startCapture(document, state, () => portInto(first));
    state.stop?.();
    // A page can only be tapped once; the second start has to find the first graph.
    expect(() => startCapture(document, state, () => portInto(second))).not.toThrow();

    expect(element.paused).toBe(false);
    expect(await loudest(second.track)).toBeGreaterThan(0.05);
  });

  it('reports a page without a video', () => {
    const empty = document.implementation.createHTMLDocument('empty');
    expect(startCapture(empty, newCaptureState(), () => portInto(new TabSoundSink()))).toBe(false);
  });

  it('adds sound to a share that has been running without it', async () => {
    const host = startHost();
    const viewer = await join(host, 'Viewer');
    const shared = createTestStream();
    const first = waitFor<{ stream: MediaStream } | null>((resolve) => {
      const off = viewer.events.on('media', (media) => {
        off();
        resolve(media);
      });
    });
    host.startSharing(shared);
    expect((await first)?.stream.getAudioTracks()).toHaveLength(0);

    const sink = new TabSoundSink();
    cleanupAfterTest(() => sink.close());
    shared.addTrack(sink.track.clone());
    host.refreshSharing();

    const arrived = await waitFor<boolean>((resolve) => {
      const check = () =>
        (host as unknown as { viewers: Map<string, { link: { senders: RTCRtpSender[] } }> }).viewers
          .size > 0 &&
        [
          ...(
            host as unknown as { viewers: Map<string, { link: { senders: RTCRtpSender[] } }> }
          ).viewers.values(),
        ].every(({ link }) => link.senders.some((s) => s.track?.kind === 'audio'))
          ? resolve(true)
          : setTimeout(check, 50);
      check();
    });
    expect(arrived).toBe(true);
  });
});
