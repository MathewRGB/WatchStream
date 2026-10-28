import { afterEach } from 'vitest';
import type { MessageLink } from '../../src/core/peer/message-link';
import { createPeerConnector } from '../../src/core/peer/peer-link';
import type { Participant } from '../../src/core/protocol/messages';
import { HostSession, type HostSessionOptions } from '../../src/core/session/host-session';
import { ViewerSession } from '../../src/core/session/viewer-session';

/** Local tests must not depend on a public STUN server. */
export const LOCAL_CONFIG = { iceServers: [], iceGatheringTimeoutMs: 2000 };

export const connector = createPeerConnector(LOCAL_CONFIG);
const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

/** Runs after the current test, even when it fails. */
export function cleanupAfterTest(cleanup: () => void): void {
  cleanups.push(cleanup);
}

export function startHost(
  options: Partial<Omit<HostSessionOptions, 'hostName' | 'connector'>> = {},
): HostSession {
  const host = new HostSession({ hostName: 'Host', connector, ...options });
  cleanupAfterTest(() => host.close());
  return host;
}

export async function join(host: HostSession, viewerName: string): Promise<ViewerSession> {
  const { code } = await host.createInvitation();
  const { session, replyCode } = await ViewerSession.join(code, { viewerName, connector });
  cleanupAfterTest(() => session.leave());
  const rosterReceived = waitFor<Participant[]>((resolve) => {
    const off = session.events.on('roster', (roster) => {
      if (roster.some((p) => p.name === viewerName)) {
        off();
        resolve(roster);
      }
    });
  });
  await host.acceptReply(replyCode);
  await rosterReceived;
  return session;
}

/** A moving picture without a camera or a screen: a canvas that changes colour. */
export function createTestStream(): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext('2d')!;
  let frame = 0;
  const timer = setInterval(() => {
    context.fillStyle = `hsl(${(frame++ * 9) % 360} 80% 50%)`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, 33);
  const stream = canvas.captureStream(30);
  cleanupAfterTest(() => {
    clearInterval(timer);
    stream.getTracks().forEach((track) => track.stop());
  });
  return stream;
}

/**
 * Like `createTestStream`, plus stereo noise as the sound. Noise cannot be compressed away, so the
 * bitrate the encoder uses shows what it is allowed to use.
 */
export function createTestStreamWithAudio(): MediaStream {
  const stream = createTestStream();
  const audio = new AudioContext();
  const buffer = audio.createBuffer(2, audio.sampleRate, audio.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i += 1) samples[i] = (Math.random() * 2 - 1) * 0.5;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const destination = audio.createMediaStreamDestination();
  destination.channelCount = 2;
  source.connect(destination);
  source.start();
  // A test that ends early closes the context while it is still starting; that is no error.
  audio.resume().catch(() => undefined);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  cleanupAfterTest(() => void audio.close());
  return stream;
}

export function waitFor<T>(
  subscribe: (resolve: (value: T) => void) => void,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

export function nextMessage(link: MessageLink): Promise<string> {
  return waitFor((resolve) => {
    const off = link.events.on('message', (data) => {
      off();
      resolve(data);
    });
  });
}

export function opened(link: MessageLink): Promise<void> {
  if (link.state === 'open') return Promise.resolve();
  return waitFor((resolve) => link.events.on('open', resolve));
}

export function closed(link: MessageLink): Promise<void> {
  if (link.state === 'closed') return Promise.resolve();
  return waitFor((resolve) => link.events.on('close', resolve));
}
