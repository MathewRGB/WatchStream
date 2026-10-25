import { HandshakeCodeError } from '../../core/handshake/handshake-code';
import type { HostSession } from '../../core/session/host-session';
import { createChatPanel } from '../components/chat-panel';
import { createCodeBox, createCodeInput } from '../components/code-box';
import { createParticipantList } from '../components/participant-list';
import { describeError } from '../describe-error';
import { button, el, setStatus } from '../dom';

export interface HostViewOptions {
  session: HostSession;
  hostName: string;
  onEnd(): void;
}

export function createHostView({ session, hostName, onEnd }: HostViewOptions): HTMLElement {
  const participants = createParticipantList();
  const chat = createChatPanel({ selfId: () => session.hostId, send: (t) => session.sendChat(t) });
  const invitations = el('div', { className: 'invitations', testId: 'invitations' });
  const slots = el('p', { className: 'hint', testId: 'open-slots' });
  const status = el('p', { className: 'status', testId: 'host-status' });

  const refresh = () => {
    participants.update(session.participants, session.hostId);
    inviteButton.disabled = session.openSlots <= 0;
    slots.textContent =
      session.openSlots > 0 ? `Places left: ${session.openSlots}` : 'The session is full.';
  };

  const inviteButton = button('Invite a viewer', 'invite-button', () => {
    inviteButton.disabled = true;
    session
      .createInvitation()
      .then(({ inviteId, code }) => {
        invitations.append(createInvitationCard(session, inviteId, code, refresh));
        setStatus(status, '');
      })
      .catch((error: unknown) => setStatus(status, describeError(error), 'error'))
      .finally(refresh);
  });

  session.events.on('roster', refresh);
  session.events.on('chat', (message) => chat.add(message));
  refresh();

  return el(
    'section',
    { className: 'host', testId: 'host-view' },
    el(
      'header',
      {},
      el('h1', { text: `Hosting as ${hostName}` }),
      button('End session', 'end-button', onEnd),
    ),
    el(
      'section',
      {},
      el('h2', { text: 'Invite' }),
      el('p', {
        className: 'hint',
        text: 'Each invitation is for one person. Send the code via any messenger and paste their reply below.',
      }),
      inviteButton,
      slots,
      status,
      invitations,
    ),
    participants.element,
    chat.element,
  );
}

function createInvitationCard(
  session: HostSession,
  inviteId: string,
  code: string,
  onChange: () => void,
): HTMLElement {
  const replyInput = createCodeInput('Paste the reply code here', 'reply-input');
  const status = el('p', { className: 'status', testId: 'invitation-status' });

  const remove = () => {
    session.cancelInvitation(inviteId);
    card.remove();
    onChange();
  };

  const connectButton = button('Connect', 'connect-button', () => {
    connectButton.disabled = true;
    setStatus(status, 'Connecting…');
    session
      .acceptReply(replyInput.value)
      .then(() => {
        card.remove();
        onChange();
      })
      .catch((error: unknown) => {
        setStatus(status, describeError(error), 'error');
        // A damaged code can be pasted again; any other failure used up the invitation.
        if (error instanceof HandshakeCodeError) {
          connectButton.disabled = false;
        } else {
          replyInput.disabled = true;
          cancelButton.textContent = 'Remove';
        }
        onChange();
      });
  });
  const cancelButton = button('Cancel', 'cancel-invitation', remove);

  const card = el(
    'article',
    { className: 'invitation', testId: 'invitation' },
    createCodeBox('1. Send this invitation code', code, 'invitation-code'),
    el('label', { text: '2. Paste the reply code' }, replyInput),
    el('div', { className: 'actions' }, connectButton, cancelButton),
    status,
  );
  return card;
}
