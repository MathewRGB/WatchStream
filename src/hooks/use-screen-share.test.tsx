// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('stops the captured tracks when the page goes away', async () => {
    const { host } = createHost();
    const source = fakeCapturedStream();
    const { result, unmount } = renderHook(() => useScreenShare(host, async () => source.stream));
    await act(() => result.current.start());

    unmount();

    expect(source.track.stop).toHaveBeenCalled();
  });
});
