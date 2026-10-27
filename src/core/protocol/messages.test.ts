import { describe, expect, it } from 'vitest';
import {
  MAX_CHAT_LENGTH,
  normalizeChatText,
  parseHostMessage,
  parseViewerMessage,
  serialize,
  type HostMessage,
} from './messages';

const CHAT: Extract<HostMessage, { type: 'chat' }> = {
  type: 'chat',
  message: { id: 'm1', senderId: 'p1', senderName: 'user2', text: 'hi', sentAt: 1_700_000_000 },
};

describe('normalizeChatText', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeChatText('  hello \n')).toBe('hello');
  });

  it.each(['', '   ', 'x'.repeat(MAX_CHAT_LENGTH + 1)])('rejects %j', (text) => {
    expect(normalizeChatText(text)).toBeNull();
  });

  it('accepts text of exactly the maximum length', () => {
    expect(normalizeChatText('x'.repeat(MAX_CHAT_LENGTH))).toHaveLength(MAX_CHAT_LENGTH);
  });
});

describe('parseViewerMessage', () => {
  it('parses a chat message and trims its text', () => {
    expect(parseViewerMessage(serialize({ type: 'chat', text: ' hi ' }))).toEqual({
      type: 'chat',
      text: 'hi',
    });
  });

  it.each([
    ['invalid JSON', '{'],
    ['a non-object', '"chat"'],
    ['an array', '[]'],
    ['an unknown type', '{"type":"play"}'],
    ['a host-only type', '{"type":"roster","participants":[]}'],
    ['empty chat text', '{"type":"chat","text":"  "}'],
    ['non-string chat text', '{"type":"chat","text":42}'],
  ])('rejects %s', (_label, raw) => {
    expect(parseViewerMessage(raw)).toBeNull();
  });
});

describe('parseHostMessage', () => {
  it.each<HostMessage>([
    { type: 'welcome', participantId: 'p1' },
    {
      type: 'roster',
      participants: [
        { id: 'host', name: 'user1', role: 'host' },
        { id: 'p1', name: 'user2', role: 'viewer' },
      ],
    },
    CHAT,
  ])('round-trips a $type message', (message) => {
    expect(parseHostMessage(serialize(message))).toEqual(message);
  });

  it.each([
    ['invalid JSON', 'nope'],
    ['an unknown type', '{"type":"hello"}'],
    ['a welcome without id', '{"type":"welcome"}'],
    [
      'a roster with a bad role',
      '{"type":"roster","participants":[{"id":"a","name":"b","role":"x"}]}',
    ],
    ['a roster that is not a list', '{"type":"roster","participants":{}}'],
    ['a chat without message', '{"type":"chat"}'],
    [
      'a chat with untrimmed text',
      serialize({ ...CHAT, message: { ...CHAT.message, text: ' a' } }),
    ],
    [
      'a chat with a bad timestamp',
      '{"type":"chat","message":{"id":"m","senderId":"s","senderName":"n","text":"t","sentAt":"now"}}',
    ],
  ])('rejects %s', (_label, raw) => {
    expect(parseHostMessage(raw)).toBeNull();
  });
});
