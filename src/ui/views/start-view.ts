import { MAX_NAME_LENGTH } from '../../core/handshake/handshake-code';
import { button, el, setStatus } from '../dom';

export interface StartViewOptions {
  initialName: string;
  onHost(name: string): void;
  onJoin(name: string): void;
}

export function createStartView(options: StartViewOptions): HTMLElement {
  const nameInput = el('input', {
    testId: 'name-input',
    attrs: { type: 'text', maxlength: String(MAX_NAME_LENGTH), autocomplete: 'nickname' },
  });
  nameInput.value = options.initialName;
  const status = el('p', { className: 'status', testId: 'start-status' });

  const withName = (action: (name: string) => void) => () => {
    const name = nameInput.value.trim();
    if (name === '') {
      setStatus(status, 'Please enter a name the others will see.', 'error');
      nameInput.focus();
      return;
    }
    action(name);
  };

  return el(
    'section',
    { className: 'start', testId: 'start-view' },
    el('h1', { text: 'WatchStream' }),
    el('p', { text: 'Watch together, browser to browser.' }),
    el('label', { text: 'Your name' }, nameInput),
    el(
      'div',
      { className: 'actions' },
      button('Host a session', 'host-button', withName(options.onHost)),
      button('Join a session', 'join-button', withName(options.onJoin)),
    ),
    status,
  );
}
