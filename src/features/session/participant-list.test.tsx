// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Participant } from '@/core/protocol/messages';
import { ParticipantList } from './participant-list';

const participants: Participant[] = [
  { id: 'h', name: 'Mathias', role: 'host' },
  { id: 'v1', name: 'Julia', role: 'viewer' },
];

describe('ParticipantList', () => {
  it('lists every participant by name', () => {
    render(<ParticipantList participants={participants} selfId={null} />);

    expect(screen.getAllByTestId('participant-name').map((n) => n.textContent)).toEqual([
      'Mathias',
      'Julia',
    ]);
  });

  it('marks the host and the own entry', () => {
    render(<ParticipantList participants={participants} selfId="v1" />);

    const [host, viewer] = screen.getAllByTestId('participant');
    expect(within(host!).getByText('host')).toBeInTheDocument();
    expect(within(host!).queryByText('you')).toBeNull();
    expect(within(viewer!).getByText('you')).toBeInTheDocument();
    expect(within(viewer!).queryByText('host')).toBeNull();
  });
});
