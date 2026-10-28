import { browser } from 'wxt/browser';
import { newCaptureState, startCapture, type CaptureState } from '@/core/tab-sound/capture';

const STATE_KEY = '__watchstreamTabSound';

/**
 * Injected on request into the tab the host chose (Firefox only; it is never declared in the
 * manifest). Runs once per frame and does nothing in frames without a video.
 */
export default defineContentScript({
  registration: 'runtime',
  include: ['firefox'],
  matches: [], // Never declared: the host grants each site when choosing the tab.
  allFrames: true,
  main() {
    const holder = globalThis as unknown as Record<string, CaptureState | undefined>;
    const state = (holder[STATE_KEY] ??= newCaptureState());
    try {
      startCapture(document, state, (name) => browser.runtime.connect({ name }));
    } catch {
      // The page's own player holds the element. The host sees no sound arrive and is told so.
    }
  },
});
