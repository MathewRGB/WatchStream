import { describe, expect, it } from 'vitest';
import { DelayedAudio } from '../../src/core/media/delayed-audio';
import { createTestStream, join, startHost, waitFor } from './helpers';
import type { SharedMedia } from '../../src/core/session/viewer-session';

/** A stream whose sound is silent for `silentMs` and then a steady tone: an onset to time. */
function streamWithLateTone(silentMs: number): MediaStream {
  const stream = createTestStream();
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  oscillator.frequency.value = 440;
  const gain = audio.createGain();
  gain.gain.value = 0;
  gain.gain.setValueAtTime(0.8, audio.currentTime + silentMs / 1000);
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  audio.resume().catch(() => undefined);
  destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  return stream;
}

/** Milliseconds from `start` until the output carries sound; `null` if it never does. */
async function onset(audio: DelayedAudio, start: number, withinMs: number): Promise<number | null> {
  const analyser = audio.audioContext.createAnalyser();
  analyser.fftSize = 256;
  audio.output.connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  while (performance.now() - start < withinMs) {
    analyser.getFloatTimeDomainData(samples);
    const peak = samples.reduce((max, v) => Math.max(max, Math.abs(v)), 0);
    if (peak > 0.05) return performance.now() - start;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return null;
}

describe('DelayedAudio over WebRTC', () => {
  it('plays the sound of a received stream, and exactly as much later as asked', async () => {
    const host = startHost();
    const viewer = await join(host, 'user2');
    const arrived = waitFor<SharedMedia | null>((resolve) => {
      const off = viewer.events.on('media', (media) => {
        off();
        resolve(media);
      });
    });
    host.startSharing(streamWithLateTone(2500));
    const media = (await arrived)!;

    // Attached to a muted element, as the stage does: Chromium delivers the sound only then.
    const element = document.createElement('video');
    element.muted = true;
    element.srcObject = media.stream;
    document.body.append(element);
    await element.play();

    const start = performance.now();
    const direct = new DelayedAudio(media.stream, 0, 1);
    const late = new DelayedAudio(media.stream, 1500, 1);
    await direct.resume();
    await late.resume();
    try {
      const [first, second] = await Promise.all([
        onset(direct, start, 9000),
        onset(late, start, 9000),
      ]);
      // Positive control: the sound arrives at all, and the plain path hears the tone first.
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(second! - first!).toBeGreaterThan(1200);
      expect(second! - first!).toBeLessThan(1900);
    } finally {
      direct.dispose();
      late.dispose();
      element.remove();
    }
  }, 30_000);
});
