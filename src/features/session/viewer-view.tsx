import { useState } from 'react';
import { MessageSquare, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CandidateSummary } from '@/core/peer/candidates';
import type { PeerConnector } from '@/core/peer/message-link';
import { ViewerSession } from '@/core/session/viewer-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useViewerSession } from '@/hooks/use-viewer-session';
import { useViewerShare } from '@/hooks/use-viewer-share';
import { useVolume } from '@/hooks/use-volume';
import type { CaptureDisplay } from '@/lib/capture';
import { copyText } from '@/lib/clipboard';
import { AppShell } from './app-shell';
import { ChatPanel } from './chat-panel';
import { CodeInput } from './code-box';
import { describeError } from './describe-error';
import { countIncoming } from './incoming';
import { ParticipantList } from './participant-list';
import { ReplyStep } from './reply-step';
import { SetupArea } from './setup-area';
import { Sidebar, type SidebarTab } from './sidebar';
import { Stage } from './stage';
import { StageVideo } from './stage-video';
import { TechnicalDetails } from './technical-details';
import { ViewerShareControls } from './viewer-share-controls';

const APP_TITLE = 'WatchStream';

interface ViewerViewProps {
  connector: PeerConnector;
  /** Remembers the volume. */
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  /** Asks the user what to share when they want to share too. */
  capture: CaptureDisplay;
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

export function ViewerView({ connector, storage, capture, viewerName, onLeave }: ViewerViewProps) {
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
        storage={storage}
        capture={capture}
        onLeave={leave}
      />
    );
  }

  return (
    <AppShell
      testId="viewer-view"
      title={APP_TITLE}
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
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  capture: CaptureDisplay;
  onLeave: () => void;
}

function JoinedSession(props: JoinedSessionProps) {
  const { session, onLeave } = props;
  const { state } = useViewerSession(session);

  if (state === 'connected') return <ConnectedView {...props} />;
  if (state === 'disconnected') return <EndedView session={session} onLeave={onLeave} />;
  return <JoiningView {...props} />;
}

function ConnectedView({ session, storage, capture, onLeave }: JoinedSessionProps) {
  const { participants, participantId, media, share, shareEnd, ownShare } =
    useViewerSession(session);
  const sharing = useViewerShare(session, capture);
  const messages = useChatMessages(session);
  const { volume, setVolume } = useVolume(storage);
  const { hostName } = session;

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
      incomingMessages={countIncoming(messages, participantId)}
      title={APP_TITLE}
      status={<span data-testid="viewer-state">Connected to {hostName}</span>}
      actions={<LeaveButton onClick={onLeave} />}
      stage={
        <Stage
          emptyMessage={`Waiting for ${hostName} to share something.`}
          overlay={
            <ViewerShareControls
              share={share}
              shareEnd={shareEnd}
              hostName={hostName}
              stageTaken={media !== null}
              controls={sharing}
            />
          }
        >
          {share === 'sharing' && ownShare ? (
            <StageVideo stream={ownShare} silent label="You are sharing" />
          ) : (
            media && (
              <StageVideo
                stream={media.stream}
                volume={volume}
                onVolumeChange={setVolume}
                label={`${participants.find((p) => p.id === media.sourceId)?.name ?? hostName} is sharing`}
              />
            )
          )}
        </Stage>
      }
      sidebar={<Sidebar tabs={tabs} defaultTab="chat" />}
    />
  );
}

function EndedView({ session, onLeave }: Pick<JoinedSessionProps, 'session' | 'onLeave'>) {
  return (
    <AppShell
      testId="viewer-view"
      title={APP_TITLE}
      status="Disconnected"
      actions={<LeaveButton onClick={onLeave} />}
      stage={
        <SetupArea>
          <Card>
            <CardContent className="flex flex-col items-start gap-3">
              <p role="alert" className="text-destructive" data-testid="viewer-state">
                {session.removedByHost
                  ? 'The host removed you from the session.'
                  : 'The session has ended.'}
              </p>
              {session.removedByHost ? (
                <p className="text-sm text-muted-foreground" data-testid="removed-note">
                  {session.hostName} took you out of the session. You can join again with a new
                  invitation.
                </p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    The connection to {session.hostName} was lost or ended. If you did not expect
                    this, check the technical details below.
                  </p>
                  <TechnicalDetails details={session.diagnostics} />
                </>
              )}
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

function JoiningView({ session, replyCode, copied, candidates, onLeave }: JoinedSessionProps) {
  return (
    <AppShell
      testId="viewer-view"
      title={APP_TITLE}
      status={`Joining ${session.hostName}'s session`}
      actions={<LeaveButton onClick={onLeave} />}
      stage={
        <SetupArea>
          <ReplyStep
            hostName={session.hostName}
            replyCode={replyCode}
            copied={copied}
            candidates={candidates}
          />
        </SetupArea>
      }
    />
  );
}
