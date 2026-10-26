import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { HostSession } from '@/core/session/host-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useHostSession } from '@/hooks/use-host-session';
import { ChatPanel } from './chat-panel';
import { describeError } from './describe-error';
import { InvitationCard } from './invitation-card';
import { ParticipantList } from './participant-list';

interface HostViewProps {
  session: HostSession;
  hostName: string;
  onEnd: () => void;
}

interface OpenInvitation {
  inviteId: string;
  code: string;
}

export function HostView({ session, hostName, onEnd }: HostViewProps) {
  const { participants, openSlots } = useHostSession(session);
  const messages = useChatMessages(session);
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
    <div className="flex flex-col gap-4" data-testid="host-view">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Hosting as {hostName}</h1>
        <Button variant="outline" onClick={onEnd} data-testid="end-button">
          End session
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Invite</CardTitle>
          <CardDescription>
            Each invitation is for one person. Send the code via any messenger and paste their reply
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        </CardContent>
      </Card>

      <ParticipantList participants={participants} selfId={session.hostId} />
      <ChatPanel
        messages={messages}
        selfId={session.hostId}
        onSend={(text) => session.sendChat(text)}
      />
    </div>
  );
}
