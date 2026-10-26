import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Participant } from '@/core/protocol/messages';

interface ParticipantListProps {
  participants: Participant[];
  selfId: string | null;
}

export function ParticipantList({ participants, selfId }: ParticipantListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Participants</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2" data-testid="participants">
          {participants.map((participant) => (
            <li key={participant.id} className="flex items-center gap-2" data-testid="participant">
              <span data-testid="participant-name">{participant.name}</span>
              {participant.role === 'host' && <Badge variant="secondary">host</Badge>}
              {participant.id === selfId && <Badge variant="outline">you</Badge>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
