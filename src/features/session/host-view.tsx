import {
  MessageSquare,
  MonitorUp,
  MonitorX,
  SlidersHorizontal,
  UserPlus,
  Users,
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
  const { participants, openSlots, sharedStream, quality } = useHostSession(session);
  const share = useScreenShare(session, capture);
  const messages = useChatMessages(session);
  const viewers = participants.length - 1;

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
      content: <ParticipantList participants={participants} selfId={session.hostId} />,
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
          {sharedStream && <StageVideo stream={sharedStream} silent label="You are sharing" />}
        </Stage>
      }
      sidebar={<Sidebar tabs={tabs} defaultTab="invite" />}
    />
  );
}
