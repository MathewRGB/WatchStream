// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/core/protocol/messages';
import { SessionError } from '@/core/session/session-error';
import { ChatPanel } from './chat-panel';

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  senderId: 'other',
  senderName: 'user2',
  text: 'hello',
  sentAt: 0,
  ...overrides,
});

describe('ChatPanel', () => {
  it('says so while there are no messages', () => {
    render(<ChatPanel messages={[]} selfId="me" onSend={vi.fn()} />);

    expect(screen.getByTestId('chat-empty')).toHaveTextContent('No messages yet.');
  });

  it('drops the empty note once a message arrives', () => {
    render(<ChatPanel messages={[message()]} selfId="me" onSend={vi.fn()} />);

    expect(screen.queryByTestId('chat-empty')).toBeNull();
  });

  it('shows each message with its sender', () => {
    render(<ChatPanel messages={[message()]} selfId="me" onSend={vi.fn()} />);

    const item = screen.getByTestId('chat-message');
    expect(within(item).getByTestId('chat-sender')).toHaveTextContent('user2');
    expect(item).toHaveTextContent('hello');
  });

  it('labels own messages as "You"', () => {
    render(<ChatPanel messages={[message({ senderId: 'me' })]} selfId="me" onSend={vi.fn()} />);

    const item = screen.getByTestId('chat-message');
    expect(item).toHaveAttribute('data-own', 'true');
    expect(within(item).getByTestId('chat-sender')).toHaveTextContent('You');
  });

  it('scrolls its own list to the newest message when one comes in, and nothing else', () => {
    // Where a parent scrolls, a sidebar that waits off-screen in full screen is pulled into view.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const { rerender } = render(<ChatPanel messages={[]} selfId="me" onSend={vi.fn()} />);
    const list = screen.getByTestId('chat-messages');
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });

    rerender(<ChatPanel messages={[message()]} selfId="me" onSend={vi.fn()} />);

    expect(list.scrollTop).toBe(500);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // @ts-expect-error - remove the stub again
    delete Element.prototype.scrollIntoView;
  });

  it('renders message text as text, never as markup', () => {
    const text = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <ChatPanel
        messages={[message({ text, senderName: '<b>x</b>' })]}
        selfId="me"
        onSend={vi.fn()}
      />,
    );

    expect(container.querySelector('img, b')).toBeNull();
    expect(screen.getByTestId('chat-message')).toHaveTextContent(text);
  });

  it('sends the typed text and clears the input', async () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} selfId="me" onSend={onSend} />);

    await userEvent.type(screen.getByTestId('chat-input'), 'popcorn?');
    await userEvent.click(screen.getByTestId('chat-send'));

    expect(onSend).toHaveBeenCalledWith('popcorn?');
    expect(screen.getByTestId('chat-input')).toHaveValue('');
  });

  it('sends on Enter', async () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} selfId="me" onSend={onSend} />);

    await userEvent.type(screen.getByTestId('chat-input'), 'hi{Enter}');

    expect(onSend).toHaveBeenCalledWith('hi');
  });

  it('does not send blank text', async () => {
    const onSend = vi.fn();
    render(<ChatPanel messages={[]} selfId="me" onSend={onSend} />);

    await userEvent.type(screen.getByTestId('chat-input'), '   {Enter}');

    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows an error and keeps the text when sending fails', async () => {
    const onSend = () => {
      throw new SessionError('not-connected', 'Not connected to the host.');
    };
    render(<ChatPanel messages={[]} selfId="me" onSend={onSend} />);

    await userEvent.type(screen.getByTestId('chat-input'), 'hello?{Enter}');

    expect(screen.getByRole('alert')).toHaveTextContent('Not connected to the host.');
    expect(screen.getByTestId('chat-input')).toHaveValue('hello?');
  });
});
