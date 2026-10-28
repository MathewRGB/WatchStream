import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@/core/protocol/messages';
import { countIncoming } from './incoming';

const message = (id: string, senderId: string): ChatMessage => ({
  id,
  senderId,
  senderName: senderId,
  text: 'hi',
  sentAt: 1,
});

describe('countIncoming', () => {
  it('counts only what others sent', () => {
    const messages = [
      message('1', 'me'),
      message('2', 'them'),
      message('3', 'me'),
      message('4', 'x'),
    ];

    expect(countIncoming(messages, 'me')).toBe(2);
  });

  it('counts nothing when there are no messages, and everything while the own id is not known', () => {
    expect(countIncoming([], 'me')).toBe(0);
    expect(countIncoming([message('1', 'a'), message('2', 'b')], null)).toBe(2);
  });

  it('does not grow with an own message', () => {
    const before = [message('1', 'them')];

    expect(countIncoming([...before, message('2', 'me')], 'me')).toBe(countIncoming(before, 'me'));
  });
});
