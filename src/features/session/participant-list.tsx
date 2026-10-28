import { Badge } from '@/components/ui/badge';
import type { LinkHealth } from '@/core/media/load-monitor';
import type { Participant } from '@/core/protocol/messages';

interface ParticipantListProps {
  participants: Participant[];
  selfId: string | null;
  /** The host only: who is not keeping up with the picture. Others are not told. */
  health?: ReadonlyMap<string, LinkHealth>;
}

export function ParticipantList({ participants, selfId, health }: ParticipantListProps) {
  return (
    <ul className="flex flex-col gap-2" data-testid="participants">
      {participants.map((participant) => (
        <li key={participant.id} className="flex items-center gap-2" data-testid="participant">
          <span data-testid="participant-name">{participant.name}</span>
          {participant.role === 'host' && <Badge variant="secondary">host</Badge>}
          {participant.id === selfId && <Badge variant="outline">you</Badge>}
          {health?.get(participant.id) === 'slow' && (
            <Badge
              variant="outline"
              title="This viewer's connection or computer is not keeping up with the picture."
              data-testid="participant-slow"
            >
              slow
            </Badge>
          )}
        </li>
      ))}
    </ul>
  );
}
