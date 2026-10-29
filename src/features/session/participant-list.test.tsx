// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

  it('shows what reaches a viewer and why it does not arrive well, for the host who has reports', () => {
    const receive = new Map([
      [
        'v1',
        {
          loss: 0.08,
          fps: 12,
          kbps: 900,
          jitterMs: 40,
          bufferMs: 500,
          freezes: 2,
          freezeMs: 800,
          height: 480,
          rttMs: 300,
        },
      ],
    ]);
    render(<ParticipantList participants={participants} selfId="h" receive={receive} />);

    const [host, viewer] = screen.getAllByTestId('participant');
    expect(within(host!).queryByTestId('participant-receive')).toBeNull();
    expect(within(viewer!).getByTestId('participant-receive')).toHaveTextContent('8.0 % lost');
    expect(within(viewer!).getByTestId('participant-problem')).toHaveTextContent(
      /Packets are lost/,
    );
  });

  it('shows nothing about reception without reports', () => {
    render(<ParticipantList participants={participants} selfId="v1" />);

    expect(screen.queryByTestId('participant-receive')).toBeNull();
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

  describe('removing a viewer', () => {
    it('has no button for a viewer, who cannot remove anybody', () => {
      render(<ParticipantList participants={participants} selfId="v1" />);

      expect(screen.queryByTestId('participant-remove')).toBeNull();
    });

    it('has a button for every viewer but not for the host', () => {
      render(<ParticipantList participants={participants} selfId="h" onRemove={() => {}} />);

      const [host, viewer] = screen.getAllByTestId('participant');
      expect(within(host!).queryByTestId('participant-remove')).toBeNull();
      expect(within(viewer!).getByTestId('participant-remove')).toHaveAccessibleName(
        'Remove user2',
      );
    });

    it('asks once, and removes only when it is confirmed', async () => {
      const onRemove = vi.fn();
      render(<ParticipantList participants={participants} selfId="h" onRemove={onRemove} />);

      await userEvent.click(screen.getByTestId('participant-remove'));
      expect(onRemove).not.toHaveBeenCalled();
      expect(screen.getByTestId('participant-remove-confirm')).toBeInTheDocument();

      await userEvent.click(screen.getByTestId('participant-remove-confirm'));

      expect(onRemove).toHaveBeenCalledExactlyOnceWith('v1');
    });

    it('goes back to the button when the host thinks better of it', async () => {
      const onRemove = vi.fn();
      render(<ParticipantList participants={participants} selfId="h" onRemove={onRemove} />);
      await userEvent.click(screen.getByTestId('participant-remove'));

      await userEvent.click(screen.getByTestId('participant-remove-cancel'));

      expect(screen.queryByTestId('participant-remove-confirm')).toBeNull();
      expect(screen.getByTestId('participant-remove')).toBeInTheDocument();
      expect(onRemove).not.toHaveBeenCalled();
    });
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
