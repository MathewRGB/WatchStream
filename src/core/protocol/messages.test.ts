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

describe('chat time stamps', () => {
  const chat = (sentAt: number) =>
    JSON.stringify({
      type: 'chat',
      message: { id: 'm', senderId: 's', senderName: 'n', text: 't', sentAt },
    });

  it('drops a time no date can hold, which would break the rendering of the chat', () => {
    expect(parseHostMessage(chat(8.64e15 + 1))).toBeNull();
    expect(parseHostMessage(chat(-8.64e15 - 1))).toBeNull();
    expect(parseHostMessage(chat(1e300))).toBeNull();
  });

  it('takes any time a date can hold', () => {
    expect(parseHostMessage(chat(8.64e15))).not.toBeNull();
    expect(parseHostMessage(chat(0))).not.toBeNull();
  });
});

describe('removed message', () => {
  it('round-trips from the host', () => {
    const removed: HostMessage = { type: 'removed' };

    expect(parseHostMessage(serialize(removed))).toEqual(removed);
  });

  it('is accepted from the host only', () => {
    expect(parseViewerMessage(serialize({ type: 'removed' }))).toBeNull();
  });

  it('carries nothing a viewer could be tricked by: extra fields are dropped', () => {
    expect(parseHostMessage('{"type":"removed","reason":"<script>"}')).toEqual({ type: 'removed' });
  });
});

describe('media messages', () => {
  const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';

  it('round-trips a media offer and a media stop from the host', () => {
    const offer: HostMessage = { type: 'media-offer', sourceId: 'p1', sdp: SDP };
    const stopped: HostMessage = { type: 'media-stopped', sourceId: 'p1' };
    const started: HostMessage = { type: 'media-started', sourceId: 'p1' };

    expect(parseHostMessage(serialize(offer))).toEqual(offer);
    expect(parseHostMessage(serialize(stopped))).toEqual(stopped);
    expect(parseHostMessage(serialize(started))).toEqual(started);
  });

  it('rejects media-started and media-stopped without a source id', () => {
    expect(parseHostMessage(JSON.stringify({ type: 'media-started' }))).toBeNull();
    expect(parseHostMessage(JSON.stringify({ type: 'media-stopped', sourceId: '' }))).toBeNull();
  });

  it('round-trips a media answer from a viewer', () => {
    const answer = { type: 'media-answer', sourceId: 'p1', sdp: SDP } as const;

    expect(parseViewerMessage(serialize(answer))).toEqual(answer);
  });

  it.each([
    ['no source id', { type: 'media-offer', sdp: SDP }],
    ['an empty source id', { type: 'media-offer', sourceId: '', sdp: SDP }],
    ['no sdp', { type: 'media-offer', sourceId: 'p1' }],
    ['an sdp that is not a description', { type: 'media-offer', sourceId: 'p1', sdp: 'hello' }],
    ['an oversized sdp', { type: 'media-offer', sourceId: 'p1', sdp: 'v=0' + 'x'.repeat(40_000) }],
  ])('rejects a media offer with %s', (_, message) => {
    expect(parseHostMessage(JSON.stringify(message))).toBeNull();
  });

  it('rejects a media answer without a valid description', () => {
    expect(
      parseViewerMessage(JSON.stringify({ type: 'media-answer', sourceId: 'p1', sdp: 'x' })),
    ).toBeNull();
  });
});

describe('share messages', () => {
  const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n';

  it('round-trips the viewer side: request, stop and an own offer', () => {
    for (const message of [
      { type: 'share-request' },
      { type: 'share-stop' },
      { type: 'media-offer', sourceId: 'p1', sdp: SDP },
    ] as const) {
      expect(parseViewerMessage(serialize(message))).toEqual(message);
    }
  });

  it('round-trips the host side: grant, denial, revoke and an answer', () => {
    for (const message of [
      { type: 'share-granted' },
      { type: 'share-denied', reason: 'declined' },
      { type: 'share-denied', reason: 'busy' },
      { type: 'share-revoked' },
      { type: 'media-answer', sourceId: 'p1', sdp: SDP },
    ] as const) {
      expect(parseHostMessage(serialize(message))).toEqual(message);
    }
  });

  it('refuses a denial with an unknown reason and an offer or answer without a description', () => {
    expect(parseHostMessage('{"type":"share-denied","reason":"because"}')).toBeNull();
    expect(parseHostMessage('{"type":"share-denied"}')).toBeNull();
    expect(parseViewerMessage('{"type":"media-offer","sourceId":"p1","sdp":"nope"}')).toBeNull();
    expect(parseHostMessage('{"type":"media-answer","sourceId":"","sdp":"v=0"}')).toBeNull();
  });

  it('accepts each message from its own side only', () => {
    expect(parseHostMessage(serialize({ type: 'share-request' }))).toBeNull();
    expect(parseViewerMessage(serialize({ type: 'share-granted' }))).toBeNull();
    expect(parseViewerMessage(serialize({ type: 'share-revoked' }))).toBeNull();
  });
});

describe('receive-report message', () => {
  const report = {
    loss: 0.02,
    fps: 24,
    kbps: 1800,
    jitterMs: 12,
    bufferMs: 180,
    freezes: 0,
    freezeMs: 0,
    height: 720,
    rttMs: 150,
  };

  it('round-trips a report, with fields the browser could not fill as null', () => {
    const sent = { ...report, bufferMs: null, freezes: null };

    expect(parseViewerMessage(JSON.stringify({ type: 'receive-report', report: sent }))).toEqual({
      type: 'receive-report',
      report: sent,
    });
  });

  it('treats a missing field as null and drops extra fields', () => {
    const partial = { ...report, rttMs: undefined, x: 1 };

    expect(parseViewerMessage(JSON.stringify({ type: 'receive-report', report: partial }))).toEqual(
      { type: 'receive-report', report: { ...report, rttMs: null } },
    );
  });

  it.each([
    ['a loss above one', { ...report, loss: 1.5 }],
    ['a negative number', { ...report, fps: -1 }],
    ['a number out of range', { ...report, kbps: 1e9 }],
    ['a string', { ...report, fps: '24' }],
    ['an object', { ...report, jitterMs: { value: 1 } }],
  ])('drops a report with %s', (_name, bad) => {
    expect(parseViewerMessage(JSON.stringify({ type: 'receive-report', report: bad }))).toBeNull();
  });

  it('drops a message without a report', () => {
    expect(parseViewerMessage(JSON.stringify({ type: 'receive-report' }))).toBeNull();
    expect(parseViewerMessage(JSON.stringify({ type: 'receive-report', report: 5 }))).toBeNull();
  });

  it('is not something the host sends', () => {
    expect(parseHostMessage(JSON.stringify({ type: 'receive-report', report }))).toBeNull();
  });
});
