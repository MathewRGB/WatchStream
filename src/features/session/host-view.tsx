import {
  Check,
  MessageSquare,
  MonitorUp,
  MonitorX,
  SlidersHorizontal,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HostSession } from '@/core/session/host-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useHostSession } from '@/hooks/use-host-session';
import { useScreenShare } from '@/hooks/use-screen-share';
import type { CaptureDisplay } from '@/lib/capture';
import { AppShell } from './app-shell';
import { ChatPanel } from './chat-panel';
import { countIncoming } from './incoming';
import { InviteTab } from './invite-tab';
import { LoadLine } from './load-line';
import { ParticipantList } from './participant-list';
import { Sidebar, type SidebarTab } from './sidebar';
import { SettingsTab } from './settings-tab';
import { Stage } from './stage';
import { StageVideo } from './stage-video';

interface HostViewProps {
  session: HostSession;
  hostName: string;
  capture: CaptureDisplay;
  onEnd: () => void;
}

export function HostView({ session, hostName, capture, onEnd }: HostViewProps) {
  const { participants, openSlots, sharedStream, incoming, shareRequests, quality, load } =
    useHostSession(session);
  const share = useScreenShare(session, capture);
  const messages = useChatMessages(session);
  const viewers = participants.length - 1;
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'A viewer';
  const asking = shareRequests[0];

  const tabs: SidebarTab[] = [
    {
      id: 'invite',
      label: 'Invite',
      icon: <UserPlus />,
      content: <InviteTab session={session} openSlots={openSlots} />,
    },
    {
      id: 'people',
      label: 'People',
      icon: <Users />,
      count: participants.length,
      content: (
        <ParticipantList
          participants={participants}
          selfId={session.hostId}
          health={load.health}
          onRemove={(id) => session.removeViewer(id)}
          requests={shareRequests.map((p) => p.id)}
          sharerId={incoming?.sourceId ?? null}
          onAllowShare={(id) => session.allowShare(id)}
          onDeclineShare={(id) => session.declineShare(id)}
        />
      ),
    },
    {
      id: 'chat',
      label: 'Chat',
      icon: <MessageSquare />,
      content: (
        <ChatPanel
          messages={messages}
          selfId={session.hostId}
          onSend={(text) => session.sendChat(text)}
        />
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <SlidersHorizontal />,
      content: <SettingsTab quality={quality} onQualityChange={(id) => session.setQuality(id)} />,
    },
  ];

  return (
    <AppShell
      testId="host-view"
      incomingMessages={countIncoming(messages, session.hostId)}
      title="WatchStream"
      status={`Hosting as ${hostName} · ${viewers} ${viewers === 1 ? 'viewer' : 'viewers'}`}
      actions={
        <Button variant="outline" size="sm" onClick={onEnd} data-testid="end-button">
          End session
        </Button>
      }
      stage={
        <Stage
          emptyMessage="Nothing is shared yet. Choose Share to show a tab, window or screen."
          overlay={
            <>
              {sharedStream ? (
                <Button variant="secondary" size="sm" onClick={share.stop} data-testid="stop-share">
                  <MonitorX /> Stop sharing
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void share.start()}
                  disabled={share.starting}
                  data-testid="share-button"
                >
                  <MonitorUp /> Share
                </Button>
              )}
              {incoming && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => session.revokeShare()}
                  data-testid="stop-viewer-share"
                >
                  <MonitorX /> Stop {nameOf(incoming.sourceId)}&apos;s share
                </Button>
              )}
              {asking && (
                <p
                  role="status"
                  className="flex items-center gap-2 rounded-md bg-background/70 px-2 py-1 text-sm"
                  data-testid="share-request-banner"
                >
                  {nameOf(asking.id)} wants to share
                  {shareRequests.length > 1 && ` (+${shareRequests.length - 1})`}
                  <Button
                    size="sm"
                    onClick={() => session.allowShare(asking.id)}
                    data-testid="share-allow"
                  >
                    <Check /> Allow
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => session.declineShare(asking.id)}
                    data-testid="share-decline"
                  >
                    <X /> Decline
                  </Button>
                </p>
              )}
              {(sharedStream || incoming) && viewers > 0 && <LoadLine load={load} />}
              {share.error && (
                <p
                  role="alert"
                  className="rounded-md bg-background/70 px-2 py-1 text-sm text-destructive"
                  data-testid="share-error"
                >
                  {share.error}
                </p>
              )}
            </>
          }
        >
          {incoming ? (
            <StageVideo
              stream={incoming.stream}
              label={`${nameOf(incoming.sourceId)} is sharing`}
            />
          ) : (
            sharedStream && <StageVideo stream={sharedStream} silent label="You are sharing" />
          )}
        </Stage>
      }
      sidebar={<Sidebar tabs={tabs} defaultTab="invite" />}
    />
  );
}
