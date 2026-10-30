import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  pickAudibleTab,
  startTabSound,
  tabSoundSupported,
  TabSoundError,
  type TabChoice,
} from './tab-sound';

type Listener = (...args: never[]) => void;
const connectListeners = new Set<Listener>();

vi.mock('wxt/browser', () => ({
  browser: {
    permissions: { request: async () => true },
    scripting: { executeScript: async () => [] },
    runtime: {
      onConnect: {
        addListener: (listener: Listener) => connectListeners.add(listener),
        removeListener: (listener: Listener) => connectListeners.delete(listener),
      },
    },
  },
}));

describe('tabSoundSupported', () => {
  it('is false, and does not throw, on a page without extension APIs', () => {
    expect(() => tabSoundSupported()).not.toThrow();
    expect(tabSoundSupported()).toBe(false);
  });
});

const tab = (id: number, windowId: number, audible: boolean): TabChoice => ({
  id,
  windowId,
  audible,
  title: `Tab ${id}`,
  origin: 'https://example.org',
});

describe('startTabSound', () => {
  afterEach(() => {
    vi.useRealTimers();
    connectListeners.clear();
  });

  it('ends a capture whose first sound comes after the host was told there is none', async () => {
    vi.useFakeTimers();
    const context = {
      state: 'running',
      resume: async () => undefined,
      close: async () => undefined,
      createMediaStreamDestination: () => ({
        stream: { getAudioTracks: () => [{ stop: () => undefined }] },
      }),
    } as unknown as AudioContext;
    const messages: ((raw: unknown) => void)[] = [];
    const port = {
      name: 'watchstream-tab-sound',
      sender: { tab: { id: 1 } },
      disconnect: vi.fn(),
      onMessage: { addListener: (listener: (raw: unknown) => void) => messages.push(listener) },
      onDisconnect: { addListener: () => undefined },
    };

    const started = startTabSound(tab(1, 1, true), () => undefined, context);
    const failed = expect(started).rejects.toBeInstanceOf(TabSoundError);
    await vi.advanceTimersByTimeAsync(0);
    const [onConnect] = [...connectListeners] as ((p: typeof port) => void)[];
    onConnect!(port);
    await vi.advanceTimersByTimeAsync(4000);
    await failed;

    messages[0]!({ kind: 'pcm', sampleRate: 48_000, channels: [new Float32Array(128)] });

    expect(port.disconnect).toHaveBeenCalled();
  });
});

describe('pickAudibleTab', () => {
  it('takes the only tab that plays sound', () => {
    expect(pickAudibleTab([tab(1, 1, false), tab(2, 2, true)], 1)?.id).toBe(2);
  });

  it('takes the one in the host window when several play sound', () => {
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 2, true)], 2)?.id).toBe(2);
  });

  it('gives up when it cannot tell', () => {
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 1, true)], 1)).toBeNull();
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 2, true)])).toBeNull();
    expect(pickAudibleTab([tab(1, 1, false)], 1)).toBeNull();
  });
});
