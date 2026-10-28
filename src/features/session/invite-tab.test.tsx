// @vitest-environment happy-dom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_VIEWERS } from '@/core/session/host-session';
import { SessionError } from '@/core/session/session-error';
import { createHost } from '@/core/testing/session-fixtures';
import { useHostSession } from '@/hooks/use-host-session';
import { InviteTab } from './invite-tab';

/** The tab with the places of a real host session, as the host view gives it. */
function Tab({ session }: { session: ReturnType<typeof createHost>['host'] }) {
  const { openSlots } = useHostSession(session);
  return <InviteTab session={session} openSlots={openSlots} />;
}

/** Types a number into the field and leaves it, as a person would. */
async function setCount(value: string) {
  const input = screen.getByTestId('invite-count');
  await userEvent.clear(input);
  if (value !== '') await userEvent.type(input, value);
  await userEvent.tab();
}

describe('InviteTab with several invitations', () => {
  it('creates one invitation by default, with no label, as before', async () => {
    const { host } = createHost();
    render(<Tab session={host} />);
    expect(screen.getByTestId('invite-button')).toHaveTextContent('Invite a viewer');

    await userEvent.click(screen.getByTestId('invite-button'));

    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(1));
    expect(screen.queryByTestId('invitation-label')).toBeNull();
    expect(screen.getByTestId('open-slots')).toHaveTextContent(`Places left: ${MAX_VIEWERS - 1}`);
  });

  it('creates as many invitations at once as asked for, each with its own code and number', async () => {
    const { host } = createHost();
    render(<Tab session={host} />);

    await setCount('4');
    expect(screen.getByTestId('invite-button')).toHaveTextContent('Invite 4 viewers');
    await userEvent.click(screen.getByTestId('invite-button'));

    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(4));
    const codes = screen
      .getAllByTestId('invitation-code')
      .map((code) => (code as HTMLTextAreaElement).value);
    expect(new Set(codes).size).toBe(4);
    expect(screen.getAllByTestId('invitation-label').map((label) => label.textContent)).toEqual([
      'Invitation 1',
      'Invitation 2',
      'Invitation 3',
      'Invitation 4',
    ]);
    expect(screen.getByTestId('open-slots')).toHaveTextContent(`Places left: ${MAX_VIEWERS - 4}`);
  });

  it('never asks for more than there are places, and clamps what was typed', async () => {
    const { host } = createHost({ maxViewers: 3 });
    render(<Tab session={host} />);

    await setCount('9');

    expect(screen.getByTestId('invite-count')).toHaveValue(3);
    expect(screen.getByTestId('invite-button')).toHaveTextContent('Invite 3 viewers');
    await userEvent.click(screen.getByTestId('invite-button'));
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(3));
    expect(screen.getByTestId('invite-button')).toBeDisabled();
    expect(screen.getByTestId('open-slots')).toHaveTextContent('The session is full.');
  });

  it('falls back to one for something that is not a number or is below one', async () => {
    const { host } = createHost();
    render(<Tab session={host} />);

    await setCount('0');
    expect(screen.getByTestId('invite-count')).toHaveValue(1);

    await userEvent.clear(screen.getByTestId('invite-count'));
    expect(screen.getByTestId('invite-button')).toHaveTextContent('Invite a viewer');
  });

  it('takes the count down with the places that are left', async () => {
    const { host } = createHost({ maxViewers: 4 });
    render(<Tab session={host} />);
    await setCount('3');
    await userEvent.click(screen.getByTestId('invite-button'));
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(3));

    // One place is left, so the field no longer offers a choice.
    expect(screen.getByTestId('invite-count')).toHaveValue(1);
    expect(screen.getByTestId('invite-count')).toBeDisabled();
  });

  it('keeps the numbers of the cards that stay when one goes, and never reuses a number', async () => {
    const { host } = createHost();
    render(<Tab session={host} />);
    await setCount('3');
    await userEvent.click(screen.getByTestId('invite-button'));
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(3));

    await userEvent.click(screen.getAllByTestId('cancel-invitation')[1]!);
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(2));
    expect(screen.getAllByTestId('invitation-label').map((l) => l.textContent)).toEqual([
      'Invitation 1',
      'Invitation 3',
    ]);

    await setCount('1');
    await userEvent.click(screen.getByTestId('invite-button'));
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(3));
    expect(screen.getAllByTestId('invitation-label').at(-1)).toHaveTextContent('Invitation 4');
  });

  it('shows the cards that could be made and says what went wrong for the rest', async () => {
    const { host } = createHost();
    const original = host.createInvitation.bind(host);
    let calls = 0;
    host.createInvitation = () =>
      ++calls === 2
        ? Promise.reject(new SessionError('session-full', 'A session holds at most 12 viewers.'))
        : original();
    render(<Tab session={host} />);

    await setCount('3');
    await userEvent.click(screen.getByTestId('invite-button'));

    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(2));
    expect(screen.getByTestId('host-status')).toBeInTheDocument();
  });

  it('turns an answered invitation into a person as before, among several', async () => {
    const { host } = createHost();
    const onSlots = vi.fn();
    host.events.on('slots', onSlots);
    render(<Tab session={host} />);
    await setCount('2');
    await userEvent.click(screen.getByTestId('invite-button'));
    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(2));

    await userEvent.click(
      within(screen.getAllByTestId('invitation')[0]!).getByTestId('cancel-invitation'),
    );

    await waitFor(() => expect(screen.getAllByTestId('invitation')).toHaveLength(1));
    expect(screen.getByTestId('open-slots')).toHaveTextContent(`Places left: ${MAX_VIEWERS - 1}`);
  });
});
