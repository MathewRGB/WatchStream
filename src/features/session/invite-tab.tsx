import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CandidateSummary } from '@/core/peer/candidates';
import type { HostSession } from '@/core/session/host-session';
import { describeError } from './describe-error';
import { InvitationCard } from './invitation-card';

interface InviteTabProps {
  session: HostSession;
  openSlots: number;
}

interface OpenInvitation {
  /** Counts up for the whole session and is never used twice, so a card keeps its number. */
  number: number;
  inviteId: string;
  code: string;
  candidates: CandidateSummary;
}

/** Creates invitations, one or several at once, and takes the viewers' replies. */
export function InviteTab({ session, openSlots }: InviteTabProps) {
  const [invitations, setInvitations] = useState<OpenInvitation[]>([]);
  // What is typed in the field, kept as text: clearing it and typing a digit must not turn into "1" +
  // the digit. Out of the field, the number that counts is shown.
  const [typed, setTyped] = useState('1');
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const issued = useRef(0);
  // Never more than there are places, and at least one so that the button has a meaning.
  const wanted = Number.parseInt(typed, 10);
  const count = Math.min(Math.max(Number.isNaN(wanted) ? 1 : wanted, 1), Math.max(openSlots, 1));

  const invite = async () => {
    setCreating(true);
    // Each invitation builds a connection of its own, so they are made at the same time.
    const results = await Promise.allSettled(
      Array.from({ length: count }, () => session.createInvitation()),
    );
    const made: OpenInvitation[] = [];
    let failure: unknown = null;
    for (const result of results) {
      if (result.status === 'fulfilled') made.push({ number: ++issued.current, ...result.value });
      else failure ??= result.reason;
    }
    setInvitations((current) => [...current, ...made]);
    setError(failure === null ? null : describeError(failure));
    setCreating(false);
  };

  const closeInvitation = (inviteId: string) =>
    setInvitations((current) => current.filter((item) => item.inviteId !== inviteId));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Each invitation is for one person. Send the code via any messenger and paste their reply
        below.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="number"
          min={1}
          max={Math.max(openSlots, 1)}
          value={editing ? typed : String(count)}
          onFocus={() => {
            setTyped(String(count));
            setEditing(true);
          }}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={() => {
            setTyped(String(count));
            setEditing(false);
          }}
          disabled={openSlots <= 1 || creating}
          className="w-16"
          aria-label="Number of invitations"
          data-testid="invite-count"
        />
        <Button
          onClick={() => void invite()}
          disabled={openSlots <= 0 || creating}
          data-testid="invite-button"
        >
          {count === 1 ? 'Invite a viewer' : `Invite ${count} viewers`}
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
        {invitations.map(({ number, inviteId, code, candidates }) => (
          <InvitationCard
            key={inviteId}
            session={session}
            inviteId={inviteId}
            code={code}
            candidates={candidates}
            label={invitations.length > 1 ? `Invitation ${number}` : undefined}
            onClose={closeInvitation}
          />
        ))}
      </div>
    </div>
  );
}
