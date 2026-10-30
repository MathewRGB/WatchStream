// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createHost } from '@/core/testing/session-fixtures';
import { fakeCapturedStream } from '@/testing/fake-capture';
import { useScreenShare } from './use-screen-share';

describe('useScreenShare', () => {
  it('shares what the user picked', async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useScreenShare(host, async () => source.stream));

    await act(() => result.current.start());

    expect(host.sharedStream).toBe(source.stream);
    expect(result.current.error).toBeNull();
  });

  it('stops the share and the captured tracks', async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useScreenShare(host, async () => source.stream));
    await act(() => result.current.start());

    act(() => result.current.stop());

    expect(host.sharedStream).toBeNull();
    expect(source.track.stop).toHaveBeenCalled();
  });

  it("ends the share when the browser's own stop button is used", async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useScreenShare(host, async () => source.stream));
    await act(() => result.current.start());

    act(() => source.endFromBrowser());

    expect(host.sharedStream).toBeNull();
  });

  it('replaces a running share and stops the old tracks', async () => {
    const { host } = createHost();
    const first = fakeCapturedStream();
    const second = fakeCapturedStream();
    const streams = [first.stream, second.stream];
    const { result } = renderHook(() => useScreenShare(host, async () => streams.shift()!));
    await act(() => result.current.start());

    await act(() => result.current.start());

    expect(host.sharedStream).toBe(second.stream);
    expect(first.track.stop).toHaveBeenCalled();
    expect(second.track.stop).not.toHaveBeenCalled();
  });

  it('stays quiet when the user closes the picker', async () => {
    const { host } = createHost();
    const refuse = async () => {
      throw new DOMException('cancelled', 'NotAllowedError');
    };
    const { result } = renderHook(() => useScreenShare(host, refuse));

    await act(() => result.current.start());

    expect(result.current.error).toBeNull();
    expect(host.sharedStream).toBeNull();
    expect(result.current.starting).toBe(false);
  });

  it('explains other failures', async () => {
    const { host } = createHost();
    const broken = async () => {
      throw new TypeError('getDisplayMedia is not a function');
    };
    const { result } = renderHook(() => useScreenShare(host, broken));

    await act(() => result.current.start());

    expect(result.current.error).toMatch(/could not be started/);
  });

  it('lets go of what was picked when the session ended while the picker was open', async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    let pick!: (stream: MediaStream) => void;
    const { result } = renderHook(() =>
      useScreenShare(host, () => new Promise((resolve) => (pick = resolve))),
    );
    const started = result.current.start();
    await vi.waitFor(() => expect(pick).toBeDefined());

    host.close();
    await act(async () => {
      pick(source.stream);
      await started;
    });

    expect(source.track.stop).toHaveBeenCalled();
    expect(host.sharedStream).toBeNull();
  });

  it('stops the captured tracks when the page goes away', async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    const { result, unmount } = renderHook(() => useScreenShare(host, async () => source.stream));
    await act(() => result.current.start());

    unmount();

    expect(source.track.stop).toHaveBeenCalled();
  });

  describe('automatic sound', () => {
    it('prepares before the picker and adds the found sound to a share without any', async () => {
      const { host } = createHost();
      const source = fakeCapturedStream();
      const addTrack = vi.spyOn(source.stream, 'addTrack');
      const found = { kind: 'audio' } as MediaStreamTrack;
      const order: string[] = [];
      const autoSound = {
        prepare: vi.fn(async () => void order.push('prepare')),
        track: vi.fn(async () => found),
      };
      const capture = async () => {
        order.push('capture');
        return source.stream;
      };
      const { result } = renderHook(() => useScreenShare(host, capture, () => null, autoSound));

      await act(() => result.current.start());

      expect(order).toEqual(['prepare', 'capture']);
      expect(addTrack).toHaveBeenCalledWith(found);
    });

    it('does not look for a tab when the share brought its own sound', async () => {
      const { host } = createHost();
      const source = fakeCapturedStream();
      vi.spyOn(source.stream, 'getAudioTracks').mockReturnValue([{} as MediaStreamTrack]);
      const autoSound = { prepare: vi.fn(async () => undefined), track: vi.fn(async () => null) };
      const { result } = renderHook(() =>
        useScreenShare(
          host,
          async () => source.stream,
          () => null,
          autoSound,
        ),
      );

      await act(() => result.current.start());

      expect(autoSound.track).not.toHaveBeenCalled();
      expect(host.sharedStream).toBe(source.stream);
    });

    it('still shares when the automatic part fails', async () => {
      const { host } = createHost();
      const source = fakeCapturedStream();
      const autoSound = {
        prepare: vi.fn(async () => {
          throw new Error('denied');
        }),
        track: vi.fn(async () => {
          throw new Error('no tab');
        }),
      };
      const { result } = renderHook(() =>
        useScreenShare(
          host,
          async () => source.stream,
          () => null,
          autoSound,
        ),
      );

      await act(() => result.current.start());

      expect(host.sharedStream).toBe(source.stream);
      expect(result.current.error).toBeNull();
    });
  });
});
