import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { HostSession } from '@/core/session/host-session';
import { describeError } from './describe-error';
import { InvitationCard } from './invitation-card';

interface InviteTabProps {
  session: HostSession;
  openSlots: number;
}

interface OpenInvitation {
  inviteId: string;
  code: string;
}

/** Creates invitations and takes the viewers' replies. */
export function InviteTab({ session, openSlots }: InviteTabProps) {
  const [invitations, setInvitations] = useState<OpenInvitation[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invite = async () => {
    setCreating(true);
    try {
      const created = await session.createInvitation();
      setInvitations((current) => [...current, created]);
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setCreating(false);
    }
  };

  const closeInvitation = (inviteId: string) =>
    setInvitations((current) => current.filter((item) => item.inviteId !== inviteId));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Each invitation is for one person. Send the code via any messenger and paste their reply
        below.
      </p>
      <div className="flex items-center gap-3">
        <Button
          onClick={() => void invite()}
          disabled={openSlots <= 0 || creating}
          data-testid="invite-button"
        >
          Invite a viewer
        </Button>
        <span className="text-sm text-muted-foreground" data-testid="open-slots">
          {openSlots > 0 ? `Places left: ${openSlots}` : 'The session is full.'}
        </span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive" data-testid="host-status">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-4" data-testid="invitations">
        {invitations.map(({ inviteId, code }) => (
          <InvitationCard
            key={inviteId}
            session={session}
            inviteId={inviteId}
            code={code}
            onClose={closeInvitation}
          />
        ))}
      </div>
    </div>
  );
}
