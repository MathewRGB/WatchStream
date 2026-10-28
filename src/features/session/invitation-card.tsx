import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { HandshakeCodeError } from '@/core/handshake/handshake-code';
import type { CandidateSummary } from '@/core/peer/candidates';
import type { HostSession } from '@/core/session/host-session';
import { SessionError } from '@/core/session/session-error';
import { CodeBox, CodeInput } from './code-box';
import { describeError } from './describe-error';
import { NoPublicAddressNotice } from './no-public-address-notice';
import { TechnicalDetails } from './technical-details';

interface InvitationCardProps {
  session: HostSession;
  inviteId: string;
  code: string;
  candidates: CandidateSummary;
  /** Names the invitation when there are several, so the host knows which code goes to whom. */
  label?: string;
  /** Called when the invitation is no longer shown (connected or removed). */
  onClose: (inviteId: string) => void;
}

type Phase = 'idle' | 'connecting' | 'used-up';

/** One invitation: the code to send and the field for the viewer's reply. */
export function InvitationCard({
  session,
  inviteId,
  code,
  candidates,
  label,
  onClose,
}: InvitationCardProps) {
  const [reply, setReply] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string | undefined>();

  const connect = async () => {
    setPhase('connecting');
    setError(null);
    try {
      await session.acceptReply(reply);
      onClose(inviteId);
    } catch (caught) {
      setError(describeError(caught));
      setDetails(caught instanceof SessionError ? caught.details : undefined);
      // A damaged code can be pasted again; any other failure used up the invitation.
      setPhase(caught instanceof HandshakeCodeError ? 'idle' : 'used-up');
    }
  };

  const remove = () => {
    session.cancelInvitation(inviteId);
    onClose(inviteId);
  };

  return (
    <Card className="bg-background" data-testid="invitation">
      <CardContent className="flex flex-col gap-4">
        {label && (
          <p className="text-sm font-medium" data-testid="invitation-label">
            {label}
          </p>
        )}
        <CodeBox label="1. Send this invitation code" code={code} testId="invitation-code" />
        <NoPublicAddressNotice candidates={candidates} />
        <CodeInput
          label="2. Paste the reply code"
          value={reply}
          onChange={setReply}
          testId="reply-input"
          disabled={phase !== 'idle'}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => void connect()}
            disabled={phase !== 'idle'}
            data-testid="connect-button"
          >
            {phase === 'connecting' ? 'Connecting…' : 'Connect'}
          </Button>
          <Button type="button" variant="ghost" onClick={remove} data-testid="cancel-invitation">
            {phase === 'used-up' ? 'Remove' : 'Cancel'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="invitation-status">
            {error}
          </p>
        )}
        {details && <TechnicalDetails details={details} />}
      </CardContent>
    </Card>
  );
}
