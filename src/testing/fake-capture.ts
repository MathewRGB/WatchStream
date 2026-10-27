import { vi } from 'vitest';

/** A captured stream with one video track whose end the test can trigger like the browser does. */
export function fakeCapturedStream() {
  const listeners = new Map<string, () => void>();
  const track = {
    stop: vi.fn(),
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
  };
  // happy-dom's MediaStream knows no tracks, so the methods the code under test calls are added.
  const stream = Object.assign(new MediaStream(), {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  });
  return { stream, track, endFromBrowser: () => listeners.get('ended')?.() };
}
