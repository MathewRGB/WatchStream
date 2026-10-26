import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PeerConnector } from '@/core/peer/message-link';
import { ViewerSession } from '@/core/session/viewer-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useViewerSession } from '@/hooks/use-viewer-session';
import { ChatPanel } from './chat-panel';
import { CodeBox, CodeInput } from './code-box';
import { describeError } from './describe-error';
import { ParticipantList } from './participant-list';

interface ViewerViewProps {
  connector: PeerConnector;
  viewerName: string;
  /** Called when the user leaves; the view has already closed its session. */
  onLeave: () => void;
}

interface Joined {
  session: ViewerSession;
  replyCode: string;
}

export function ViewerView({ connector, viewerName, onLeave }: ViewerViewProps) {
  const [joined, setJoined] = useState<Joined | null>(null);

  const leave = () => {
    joined?.session.leave();
    onLeave();
  };

  return (
    <div className="flex flex-col gap-4" data-testid="viewer-view">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {joined ? `Joining ${joined.session.hostName}'s session` : 'Join a session'}
        </h1>
        <Button variant="outline" onClick={leave} data-testid="leave-button">
          Leave
        </Button>
      </header>
      {joined ? (
        <JoinedSession session={joined.session} replyCode={joined.replyCode} onLeave={leave} />
      ) : (
        <JoinForm connector={connector} viewerName={viewerName} onJoined={setJoined} />
      )}
    </div>
  );
}

interface JoinFormProps {
  connector: PeerConnector;
  viewerName: string;
  onJoined: (joined: Joined) => void;
}

function JoinForm({ connector, viewerName, onJoined }: JoinFormProps) {
  const [invitation, setInvitation] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      onJoined(await ViewerSession.join(invitation, { viewerName, connector }));
    } catch (caught) {
      setError(describeError(caught));
      setJoining(false);
    }
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <CodeInput
          label="Invitation code from the host"
          value={invitation}
          onChange={setInvitation}
          testId="invitation-input"
        />
        <div>
          <Button onClick={() => void join()} disabled={joining} data-testid="join-session-button">
            Join
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="join-status">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface JoinedSessionProps {
  session: ViewerSession;
  replyCode: string;
  onLeave: () => void;
}

function JoinedSession({ session, replyCode, onLeave }: JoinedSessionProps) {
  const { state, participants, participantId } = useViewerSession(session);
  const messages = useChatMessages(session);
  const { hostName } = session;

  return (
    <>
      {state === 'waiting-for-host' && (
        <Card data-testid="reply-step">
          <CardHeader>
            <CardTitle>Send your reply</CardTitle>
            <CardDescription data-testid="viewer-state">
              Waiting for {hostName} to paste your reply code…
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeBox
              label="Send this reply code back to the host"
              code={replyCode}
              testId="reply-code"
            />
          </CardContent>
        </Card>
      )}
      {state === 'connected' && (
        <>
          <p className="text-sm text-muted-foreground" data-testid="viewer-state">
            Connected to {hostName}.
          </p>
          <ParticipantList participants={participants} selfId={participantId} />
          <ChatPanel
            messages={messages}
            selfId={participantId}
            onSend={(text) => session.sendChat(text)}
          />
        </>
      )}
      {state === 'disconnected' && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <p role="alert" className="text-destructive" data-testid="viewer-state">
              The session has ended.
            </p>
            <Button onClick={onLeave} data-testid="back-button">
              Back to start
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
