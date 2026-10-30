// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureDisplay, isCaptureCancelled, UNPROCESSED_AUDIO } from './capture';

afterEach(() => vi.restoreAllMocks());

describe('captureDisplay', () => {
  it('asks for sound without voice processing, in stereo', async () => {
    const getDisplayMedia = vi.fn(async () => new MediaStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });

    await captureDisplay();

    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ audio: UNPROCESSED_AUDIO }),
    );
    expect(UNPROCESSED_AUDIO).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    });
  });
});

describe('captureDisplay frame rate', () => {
  it('asks for the highest rate a host can choose, so the links can ask for less', async () => {
    const getDisplayMedia = vi.fn(async () => new MediaStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getDisplayMedia },
    });

    await captureDisplay();

    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: { frameRate: { ideal: 60 } } }),
    );
  });
});

describe('isCaptureCancelled', () => {
  it.each(['NotAllowedError', 'AbortError'])('treats %s as the user closing the picker', (name) => {
    expect(isCaptureCancelled(new DOMException('x', name))).toBe(true);
  });

  it('does not hide other failures', () => {
    expect(isCaptureCancelled(new TypeError('x'))).toBe(false);
    expect(isCaptureCancelled(new DOMException('x', 'NotFoundError'))).toBe(false);
  });
});
