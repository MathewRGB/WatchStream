import type { Participant } from '../../core/protocol/messages';
import { el } from '../dom';

export interface ParticipantList {
  element: HTMLElement;
  update(participants: Participant[], selfId: string | null): void;
}

export function createParticipantList(): ParticipantList {
  const list = el('ul', { className: 'participants', testId: 'participants' });
  const element = el('section', {}, el('h2', { text: 'Participants' }), list);

  return {
    element,
    update(participants, selfId) {
      list.replaceChildren(
        ...participants.map((participant) => {
          const tags = [
            participant.role === 'host' ? 'host' : null,
            participant.id === selfId ? 'you' : null,
          ]
            .filter(Boolean)
            .join(', ');
          return el(
            'li',
            { testId: 'participant' },
            el('span', { text: participant.name }),
            tags ? el('span', { className: 'tag', text: tags }) : null,
          );
        }),
      );
    },
  };
}
