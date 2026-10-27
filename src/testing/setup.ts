import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only registers its own cleanup when `afterEach` is a global.
afterEach(() => {
  cleanup();
});

// Node has no MediaStream. happy-dom only accepts instances of it for `srcObject`.
if (typeof globalThis.MediaStream === 'undefined') {
  globalThis.MediaStream = class FakeMediaStream {
    constructor(readonly tracks: unknown[] = []) {}
    getTracks() {
      return this.tracks;
    }
    getVideoTracks() {
      return this.tracks;
    }
  } as unknown as typeof MediaStream;
}
