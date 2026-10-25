// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../../core/protocol/messages';
import { SessionError } from '../../core/session/session-error';
import { allByTestId, byTestId } from '../testing/dom-helpers';
import { createChatPanel } from './chat-panel';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  senderId: 'other',
  senderName: 'Julia',
  text: 'hello',
  sentAt: 0,
  ...overrides,
});

function submit(panel: ReturnType<typeof createChatPanel>, text: string) {
  // Forms only submit when they are part of the document.
  document.body.replaceChildren(panel.element);
  byTestId<HTMLInputElement>(panel.element, 'chat-input').value = text;
  byTestId(panel.element, 'chat-send').click();
}

describe('chat panel', () => {
  it('shows messages with their sender', () => {
    const panel = createChatPanel({ selfId: () => 'me', send: vi.fn() });

    panel.add(message());

    const [item] = allByTestId(panel.element, 'chat-message');
    expect(item?.textContent).toContain('Julia');
    expect(item?.textContent).toContain('hello');
  });

  it('labels own messages as "You"', () => {
    const panel = createChatPanel({ selfId: () => 'me', send: vi.fn() });

    panel.add(message({ senderId: 'me' }));

    const [item] = allByTestId(panel.element, 'chat-message');
    expect(item?.classList.contains('own')).toBe(true);
    expect(item?.textContent).toContain('You');
  });

  it('renders message text as text, never as markup', () => {
    const panel = createChatPanel({ selfId: () => 'me', send: vi.fn() });

    panel.add(message({ text: '<img src=x onerror=alert(1)>', senderName: '<b>x</b>' }));

    expect(panel.element.querySelector('img, b')).toBeNull();
    expect(panel.element.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('sends the typed text and clears the input', () => {
    const send = vi.fn();
    const panel = createChatPanel({ selfId: () => 'me', send });

    submit(panel, 'popcorn?');

    expect(send).toHaveBeenCalledWith('popcorn?');
    expect(byTestId<HTMLInputElement>(panel.element, 'chat-input').value).toBe('');
  });

  it('does not send blank text', () => {
    const send = vi.fn();
    const panel = createChatPanel({ selfId: () => 'me', send });

    submit(panel, '   ');

    expect(send).not.toHaveBeenCalled();
  });

  it('shows an error and keeps the text when sending fails', () => {
    const panel = createChatPanel({
      selfId: () => 'me',
      send: () => {
        throw new SessionError('not-connected', 'Not connected to the host.');
      },
    });

    submit(panel, 'hello?');

    expect(byTestId(panel.element, 'chat-status').textContent).toBe('Not connected to the host.');
    expect(byTestId<HTMLInputElement>(panel.element, 'chat-input').value).toBe('hello?');
  });

  it('can be disabled', () => {
    const panel = createChatPanel({ selfId: () => 'me', send: vi.fn() });

    panel.setEnabled(false);

    expect(byTestId<HTMLInputElement>(panel.element, 'chat-input').disabled).toBe(true);
    expect(byTestId<HTMLButtonElement>(panel.element, 'chat-send').disabled).toBe(true);
  });
});
