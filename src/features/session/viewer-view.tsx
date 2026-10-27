import { useState } from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CandidateSummary } from '@/core/peer/candidates';
import type { PeerConnector } from '@/core/peer/message-link';
import { ViewerSession } from '@/core/session/viewer-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useViewerSession } from '@/hooks/use-viewer-session';
import { copyText } from '@/lib/clipboard';
import { AppShell } from './app-shell';
import { ChatPanel } from './chat-panel';
import { CodeInput } from './code-box';
import { describeError } from './describe-error';
import { ParticipantList } from './participant-list';
import { ReplyStep } from './reply-step';
import { SetupArea } from './setup-area';
import { Sidebar, type SidebarTab } from './sidebar';
import { Stage } from './stage';
import { StageVideo } from './stage-video';
import { TechnicalDetails } from './technical-details';

interface ViewerViewProps {
  connector: PeerConnector;
  viewerName: string;
  /** Called when the user leaves; the view has already closed its session. */
  onLeave: () => void;
}

interface Joined {
  session: ViewerSession;
  replyCode: string;
  /** The reply code was put on the clipboard automatically. */
  copied: boolean;
  candidates: CandidateSummary;
}

export function ViewerView({ connector, viewerName, onLeave }: ViewerViewProps) {
  const [joined, setJoined] = useState<Joined | null>(null);

  const leave = () => {
    joined?.session.leave();
    onLeave();
  };

  if (joined) {
    return (
      <JoinedSession
        session={joined.session}
        replyCode={joined.replyCode}
        copied={joined.copied}
        candidates={joined.candidates}
        onLeave={leave}
      />
    );
  }

  return (
    <AppShell
      testId="viewer-view"
      title="WatchStream"
      status="Join a session"
      actions={<LeaveButton onClick={leave} />}
      stage={
        <SetupArea>
          <JoinForm connector={connector} viewerName={viewerName} onJoined={setJoined} />
        </SetupArea>
      }
    />
  );
}

function LeaveButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} data-testid="leave-button">
      Leave
    </Button>
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
      const { session, replyCode, candidates } = await ViewerSession.join(invitation, {
        viewerName,
        connector,
      });
      // Right after the click, so the browser still counts it as a user action.
      onJoined({ session, replyCode, candidates, copied: await copyText(replyCode) });
    } catch (caught) {
      setError(describeError(caught));
      setJoining(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join a session</CardTitle>
        <CardDescription>Paste the invitation code you received from the host.</CardDescription>
      </CardHeader>
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
  copied: boolean;
  candidates: CandidateSummary;
  onLeave: () => void;
}

function JoinedSession({ session, replyCode, copied, candidates, onLeave }: JoinedSessionProps) {
  const { state, participants, participantId, media } = useViewerSession(session);
  const messages = useChatMessages(session);
  const { hostName } = session;

  if (state === 'connected') {
    const tabs: SidebarTab[] = [
      {
        id: 'people',
        label: 'People',
        icon: <Users />,
        count: participants.length,
        content: <ParticipantList participants={participants} selfId={participantId} />,
      },
      {
        id: 'chat',
        label: 'Chat',
        icon: <MessageSquare />,
        content: (
          <ChatPanel
            messages={messages}
            selfId={participantId}
            onSend={(text) => session.sendChat(text)}
          />
        ),
      },
    ];

    return (
      <AppShell
        testId="viewer-view"
        title="WatchStream"
        status={<span data-testid="viewer-state">Connected to {hostName}</span>}
        actions={<LeaveButton onClick={onLeave} />}
        stage={
          <Stage emptyMessage={`Waiting for ${hostName} to share something.`}>
            {media && (
              <StageVideo
                stream={media.stream}
                label={`${participants.find((p) => p.id === media.sourceId)?.name ?? hostName} is sharing`}
              />
            )}
          </Stage>
        }
        sidebar={<Sidebar tabs={tabs} defaultTab="chat" />}
      />
    );
  }

  if (state === 'disconnected') {
    return (
      <AppShell
        testId="viewer-view"
        title="WatchStream"
        status="Disconnected"
        actions={<LeaveButton onClick={onLeave} />}
        stage={
          <SetupArea>
            <Card>
              <CardContent className="flex flex-col items-start gap-3">
                <p role="alert" className="text-destructive" data-testid="viewer-state">
                  The session has ended.
                </p>
                <p className="text-sm text-muted-foreground">
                  The connection to {hostName} was lost or ended. If you did not expect this, check
                  the technical details below.
                </p>
                <TechnicalDetails details={session.diagnostics} />
                <Button onClick={onLeave} data-testid="back-button">
                  Back to start
                </Button>
              </CardContent>
            </Card>
          </SetupArea>
        }
      />
    );
  }

  return (
    <AppShell
      testId="viewer-view"
      title="WatchStream"
      status={`Joining ${hostName}'s session`}
      actions={<LeaveButton onClick={onLeave} />}
      stage={
        <SetupArea>
          <ReplyStep
            hostName={hostName}
            replyCode={replyCode}
            copied={copied}
            candidates={candidates}
          />
        </SetupArea>
      }
    />
  );
}
