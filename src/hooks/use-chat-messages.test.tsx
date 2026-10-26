// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHost, flush, joinViewer } from '@/core/testing/session-fixtures';
import { useChatMessages } from './use-chat-messages';

describe('useChatMessages', () => {
  it('starts empty', () => {
    const { host } = createHost();

    const { result } = renderHook(() => useChatMessages(host));

    expect(result.current).toEqual([]);
  });

  it('collects messages in the order they arrive', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');
    const { result } = renderHook(() => useChatMessages(viewer));

    await act(async () => {
      host.sendChat('first');
      host.sendChat('second');
      await flush();
    });

    expect(result.current.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('ignores messages after unmounting', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'Julia');
    const { result, unmount } = renderHook(() => useChatMessages(viewer));
    unmount();

    host.sendChat('too late');
    await flush();

    expect(result.current).toEqual([]);
  });
});
