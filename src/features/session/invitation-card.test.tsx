// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HostSession } from '@/core/session/host-session';
import { SessionError } from '@/core/session/session-error';
import { InvitationCard } from './invitation-card';

const CANDIDATES = { local: 1, stun: 1, relay: 0, globalIpv6: 0 };

function renderCard(acceptReply: () => Promise<unknown>) {
  const session = { acceptReply, cancelInvitation: vi.fn() } as unknown as HostSession;
  render(
    <InvitationCard
      session={session}
      inviteId="invite-1"
      code="WSI1.abc"
      candidates={CANDIDATES}
      onClose={() => {}}
    />,
  );
}

async function connectWithReply() {
  await userEvent.click(screen.getByTestId('reply-input'));
  await userEvent.paste('WSR1.def');
  await userEvent.click(screen.getByTestId('connect-button'));
}

describe('InvitationCard', () => {
  it('explains a failed connection and offers the technical details of that connection', async () => {
    renderCard(async () => {
      throw new SessionError(
        'connection-failed',
        'No direct connection could be established with this viewer.',
        'Connection: connecting, ICE: checking\nTheir code offered: local 1 (no public address)',
      );
    });

    await connectWithReply();

    expect(await screen.findByTestId('invitation-status')).toHaveTextContent(
      'No direct connection',
    );
    expect(screen.getByTestId('technical-details-text')).toHaveTextContent(
      'Their code offered: local 1 (no public address)',
    );
    expect(screen.getByTestId('cancel-invitation')).toHaveTextContent('Remove');
  });

  it('asks for the right card when the reply belongs to another invitation, and lets it be pasted again', async () => {
    const acceptReply = vi.fn(async () => {
      throw new SessionError('wrong-invitation', 'x');
    });
    renderCard(acceptReply);

    await connectWithReply();

    expect(await screen.findByTestId('invitation-status')).toHaveTextContent(
      'belongs to another invitation',
    );
    expect(acceptReply).toHaveBeenCalledWith('WSR1.def', 'invite-1');
    expect(screen.getByTestId('connect-button')).toBeEnabled();
    expect(screen.getByTestId('cancel-invitation')).toHaveTextContent('Cancel');
  });

  it('shows no technical details for a damaged code', async () => {
    renderCard(async () => {
      throw new SessionError('unknown-invitation', 'x');
    });

    await connectWithReply();

    await screen.findByTestId('invitation-status');
    expect(screen.queryByTestId('technical-details')).toBeNull();
  });
});
