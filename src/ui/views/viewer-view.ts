import type { PeerConnector } from '../../core/peer/message-link';
import { ViewerSession } from '../../core/session/viewer-session';
import { createChatPanel } from '../components/chat-panel';
import { createCodeBox, createCodeInput } from '../components/code-box';
import { createParticipantList } from '../components/participant-list';
import { describeError } from '../describe-error';
import { button, el, setStatus } from '../dom';

export interface ViewerViewOptions {
  connector: PeerConnector;
  viewerName: string;
  /** Called when the user leaves; the view has already closed its session. */
  onLeave(): void;
}

export function createViewerView(options: ViewerViewOptions): HTMLElement {
  let session: ViewerSession | null = null;
  const heading = el('h1', { text: 'Join a session' });
  const body = el('div');
  const leave = () => {
    session?.leave();
    options.onLeave();
  };

  const invitationInput = createCodeInput('Paste the invitation code here', 'invitation-input');
  const joinStatus = el('p', { className: 'status', testId: 'join-status' });
  const joinButton = button('Join', 'join-session-button', () => {
    joinButton.disabled = true;
    ViewerSession.join(invitationInput.value, {
      viewerName: options.viewerName,
      connector: options.connector,
    })
      .then((joined) => {
        session = joined.session;
        heading.textContent = `Joining ${joined.session.hostName}'s session`;
        body.replaceChildren(createSessionContent(joined.session, joined.replyCode, leave));
      })
      .catch((error: unknown) => {
        setStatus(joinStatus, describeError(error), 'error');
        joinButton.disabled = false;
      });
  });

  body.append(
    el('label', { text: 'Invitation code from the host' }, invitationInput),
    el('div', { className: 'actions' }, joinButton),
    joinStatus,
  );

  return el(
    'section',
    { className: 'viewer', testId: 'viewer-view' },
    el('header', {}, heading, button('Leave', 'leave-button', leave)),
    body,
  );
}

function createSessionContent(
  session: ViewerSession,
  replyCode: string,
  leave: () => void,
): HTMLElement {
  const participants = createParticipantList();
  const chat = createChatPanel({
    selfId: () => session.participantId,
    send: (text) => session.sendChat(text),
  });
  const state = el('p', { className: 'status', testId: 'viewer-state' });
  const replyStep = el(
    'div',
    { testId: 'reply-step' },
    createCodeBox('Send this reply code back to the host', replyCode, 'reply-code'),
  );
  const connected = el('div', { className: 'connected' }, participants.element, chat.element);
  connected.hidden = true;
  chat.setEnabled(false);

  setStatus(state, `Waiting for ${session.hostName} to paste your reply code…`);
  session.events.on('state', (viewerState) => {
    if (viewerState === 'connected') {
      replyStep.remove();
      connected.hidden = false;
      chat.setEnabled(true);
      setStatus(state, `Connected to ${session.hostName}.`);
    } else if (viewerState === 'disconnected') {
      chat.setEnabled(false);
      setStatus(state, 'The session has ended.', 'error');
      state.after(button('Back to start', 'back-button', leave));
    }
  });
  session.events.on('roster', (roster) => participants.update(roster, session.participantId));
  session.events.on('chat', (message) => chat.add(message));

  return el('div', {}, state, replyStep, connected);
}
