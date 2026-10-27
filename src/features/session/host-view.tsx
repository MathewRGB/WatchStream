import { MessageSquare, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { HostSession } from '@/core/session/host-session';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useHostSession } from '@/hooks/use-host-session';
import { AppShell } from './app-shell';
import { ChatPanel } from './chat-panel';
import { InviteTab } from './invite-tab';
import { ParticipantList } from './participant-list';
import { Sidebar, type SidebarTab } from './sidebar';
import { Stage } from './stage';

interface HostViewProps {
  session: HostSession;
  hostName: string;
  onEnd: () => void;
}

export function HostView({ session, hostName, onEnd }: HostViewProps) {
  const { participants, openSlots } = useHostSession(session);
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
  ];

  return (
    <AppShell
      testId="host-view"
      title="WatchStream"
      status={`Hosting as ${hostName} · ${viewers} ${viewers === 1 ? 'viewer' : 'viewers'}`}
      actions={
        <Button variant="outline" size="sm" onClick={onEnd} data-testid="end-button">
          End session
        </Button>
      }
      stage={<Stage emptyMessage="Nothing is shared yet." />}
      sidebar={<Sidebar tabs={tabs} defaultTab="invite" />}
    />
  );
}
