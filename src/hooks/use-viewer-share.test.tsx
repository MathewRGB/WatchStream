// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHost, flush, joinViewer } from '@/core/testing/session-fixtures';
import { fakeCapturedStream } from '@/testing/fake-capture';
import { useViewerShare } from './use-viewer-share';

async function connected() {
  const { host, network } = createHost();
  const { viewer, participant } = await joinViewer(host, network, 'user2');
  return { host, viewer, id: participant.id };
}

describe('useViewerShare', () => {
  it('asks the host to share what the user picked', async () => {
    const { host, viewer } = await connected();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useViewerShare(viewer, async () => source.stream));

    await act(() => result.current.start());
    await act(() => flush());

    expect(viewer.share).toBe('requested');
    expect(host.shareRequests.map((p) => p.name)).toEqual(['user2']);
    expect(result.current.error).toBeNull();
    expect(source.track.stop).not.toHaveBeenCalled();
  });

  it('stops the captured tracks when the host says no', async () => {
    const { host, viewer, id } = await connected();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useViewerShare(viewer, async () => source.stream));
    await act(() => result.current.start());
    await act(() => flush());

    await act(async () => {
      host.declineShare(id);
      await flush();
    });

    expect(viewer.share).toBe('idle');
    expect(source.track.stop).toHaveBeenCalled();
  });

  it('stops the share and the tracks on the browser stop button', async () => {
    const { host, viewer, id } = await connected();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useViewerShare(viewer, async () => source.stream));
    await act(() => result.current.start());
    await act(async () => {
      await flush();
      host.allowShare(id);
      await flush();
    });
    expect(viewer.share).toBe('sharing');

    await act(async () => {
      source.endFromBrowser();
      await flush();
    });

    expect(viewer.share).toBe('idle');
    expect(source.track.stop).toHaveBeenCalled();
  });

  it('stops a request that is cancelled', async () => {
    const { host, viewer } = await connected();
    const source = fakeCapturedStream();
    const { result } = renderHook(() => useViewerShare(viewer, async () => source.stream));
    await act(() => result.current.start());
    await act(() => flush());

    await act(async () => {
      result.current.stop();
      await flush();
    });

    expect(host.shareRequests).toEqual([]);
    expect(source.track.stop).toHaveBeenCalled();
  });

  it('says nothing when the user closes the picker, and names a real failure', async () => {
    const { viewer } = await connected();
    const cancelled = renderHook(() =>
      useViewerShare(viewer, async () => {
        throw new DOMException('closed', 'NotAllowedError');
      }),
    );
    await act(() => cancelled.result.current.start());
    expect(cancelled.result.current.error).toBeNull();

    const broken = renderHook(() =>
      useViewerShare(viewer, async () => {
        throw new Error('no capture');
      }),
    );
    await act(() => broken.result.current.start());
    expect(broken.result.current.error).toBe('Sharing could not be started in this browser.');
    expect(viewer.share).toBe('idle');
  });

  it('stops the tracks when the page goes away', async () => {
    const { viewer } = await connected();
    const source = fakeCapturedStream();
    const { result, unmount } = renderHook(() => useViewerShare(viewer, async () => source.stream));
    await act(() => result.current.start());

    unmount();

    expect(source.track.stop).toHaveBeenCalled();
  });
});
