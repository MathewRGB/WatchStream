// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Participant } from '@/core/protocol/messages';
import { ParticipantList } from './participant-list';

const participants: Participant[] = [
  { id: 'h', name: 'user1', role: 'host' },
  { id: 'v1', name: 'user2', role: 'viewer' },
];

describe('ParticipantList', () => {
  it('lists every participant by name', () => {
    render(<ParticipantList participants={participants} selfId={null} />);

    expect(screen.getAllByTestId('participant-name').map((n) => n.textContent)).toEqual([
      'user1',
      'user2',
    ]);
  });

  it('marks a viewer who is slow, for the host who passes the health, and nobody else', () => {
    const health = new Map<string, 'good' | 'slow'>([
      ['h', 'good'],
      ['v1', 'slow'],
    ]);
    render(<ParticipantList participants={participants} selfId="h" health={health} />);

    const [host, viewer] = screen.getAllByTestId('participant');
    expect(within(host!).queryByTestId('participant-slow')).toBeNull();
    expect(within(viewer!).getByTestId('participant-slow')).toHaveTextContent('slow');
    expect(within(viewer!).getByTestId('participant-slow')).toHaveAttribute(
      'title',
      expect.stringContaining('not keeping up'),
    );
  });

  it('shows no mark without health, as for a viewer, and none for a viewer who is fine', () => {
    const { rerender } = render(<ParticipantList participants={participants} selfId="v1" />);
    expect(screen.queryByTestId('participant-slow')).toBeNull();

    rerender(
      <ParticipantList
        participants={participants}
        selfId="h"
        health={new Map([['v1', 'good' as const]])}
      />,
    );
    expect(screen.queryByTestId('participant-slow')).toBeNull();
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
