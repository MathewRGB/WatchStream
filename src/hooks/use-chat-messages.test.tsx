// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Emitter } from '@/core/events/emitter';
import type { ChatMessage } from '@/core/protocol/messages';
import { createHost, flush, joinViewer } from '@/core/testing/session-fixtures';
import { MAX_KEPT_MESSAGES, useChatMessages } from './use-chat-messages';

function message(n: number, senderId = 'other'): ChatMessage {
  return { id: `m${n}`, senderId, senderName: 'x', text: `text ${n}`, sentAt: n };
}

describe('useChatMessages', () => {
  it('starts empty', () => {
    const { host } = createHost();

    const { result } = renderHook(() => useChatMessages(host, host.hostId));

    expect(result.current).toEqual({ messages: [], incoming: 0 });
  });

  it('collects messages in the order they arrive', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'user2');
    const { result } = renderHook(() => useChatMessages(viewer, viewer.participantId));

    await act(async () => {
      host.sendChat('first');
      host.sendChat('second');
      await flush();
    });

    expect(result.current.messages.map((m) => m.text)).toEqual(['first', 'second']);
  });

  it('counts only the messages of others as incoming', () => {
    const source = new Emitter<{ chat: ChatMessage }>();
    const { result } = renderHook(() => useChatMessages({ events: source }, 'me'));

    act(() => {
      source.emit('chat', message(1, 'me'));
      source.emit('chat', message(2));
      source.emit('chat', message(3));
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.incoming).toBe(2);
  });

  it('forgets the oldest message from the 501st on, and keeps counting what comes in', () => {
    const source = new Emitter<{ chat: ChatMessage }>();
    const { result } = renderHook(() => useChatMessages({ events: source }, 'me'));

    act(() => {
      for (let n = 1; n <= MAX_KEPT_MESSAGES; n += 1) source.emit('chat', message(n));
    });
    expect(result.current.messages).toHaveLength(MAX_KEPT_MESSAGES);
    expect(result.current.messages[0]?.id).toBe('m1');
    expect(result.current.incoming).toBe(MAX_KEPT_MESSAGES);

    act(() => source.emit('chat', message(MAX_KEPT_MESSAGES + 1)));

    expect(result.current.messages).toHaveLength(MAX_KEPT_MESSAGES);
    expect(result.current.messages[0]?.id).toBe('m2');
    expect(result.current.messages.at(-1)?.id).toBe(`m${MAX_KEPT_MESSAGES + 1}`);
    // The notice rests on this number: it must grow although the list does not.
    expect(result.current.incoming).toBe(MAX_KEPT_MESSAGES + 1);
  });

  it('ignores messages after unmounting', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'user2');
    const { result, unmount } = renderHook(() => useChatMessages(viewer, viewer.participantId));
    unmount();

    host.sendChat('too late');
    await flush();

    expect(result.current.messages).toEqual([]);
  });
});
