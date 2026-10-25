import { MAX_CHAT_LENGTH, type ChatMessage } from '../../core/protocol/messages';
import { describeError } from '../describe-error';
import { el, setStatus } from '../dom';

export interface ChatPanelOptions {
  selfId: () => string | null;
  send: (text: string) => void;
}

export interface ChatPanel {
  element: HTMLElement;
  add(message: ChatMessage): void;
  setEnabled(enabled: boolean): void;
}

export function createChatPanel(options: ChatPanelOptions): ChatPanel {
  const messages = el('ol', { className: 'messages', testId: 'chat-messages' });
  const input = el('input', {
    testId: 'chat-input',
    attrs: { type: 'text', maxlength: String(MAX_CHAT_LENGTH), placeholder: 'Write a message' },
  });
  const sendButton = el('button', { text: 'Send', testId: 'chat-send', attrs: { type: 'submit' } });
  const status = el('p', { className: 'status', testId: 'chat-status' });
  const form = el('form', { className: 'chat-form' }, input, sendButton);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim() === '') return;
    try {
      options.send(input.value);
      input.value = '';
      setStatus(status, '');
    } catch (error) {
      setStatus(status, describeError(error), 'error');
    }
  });

  return {
    element: el(
      'section',
      { className: 'chat' },
      el('h2', { text: 'Chat' }),
      messages,
      form,
      status,
    ),
    add(message) {
      const own = message.senderId === options.selfId();
      const time = new Date(message.sentAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      messages.append(
        el(
          'li',
          { className: own ? 'own' : '', testId: 'chat-message' },
          el('span', { className: 'sender', text: own ? 'You' : message.senderName }),
          el('time', { text: time }),
          el('p', { className: 'text', text: message.text }),
        ),
      );
      messages.scrollTop = messages.scrollHeight;
    },
    setEnabled(enabled) {
      input.disabled = !enabled;
      sendButton.disabled = !enabled;
    },
  };
}
