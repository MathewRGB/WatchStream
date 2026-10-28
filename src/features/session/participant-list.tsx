import { useState } from 'react';
import { UserMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LinkHealth } from '@/core/media/load-monitor';
import type { Participant } from '@/core/protocol/messages';

interface ParticipantListProps {
  participants: Participant[];
  selfId: string | null;
  /** The host only: who is not keeping up with the picture. Others are not told. */
  health?: ReadonlyMap<string, LinkHealth>;
  /** The host only: removes a viewer from the session. Without it there is no button. */
  onRemove?: (participantId: string) => void;
}

export function ParticipantList({ participants, selfId, health, onRemove }: ParticipantListProps) {
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
          {onRemove && participant.role === 'viewer' && (
            <RemoveButton name={participant.name} onConfirm={() => onRemove(participant.id)} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** Asks once before removing: a viewer who is removed has to be invited anew to come back. */
function RemoveButton({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        aria-label={`Remove ${name}`}
        title={`Remove ${name} from the session`}
        onClick={() => setAsking(true)}
        data-testid="participant-remove"
      >
        <UserMinus />
      </Button>
    );
  }
  return (
    <span className="ml-auto flex items-center gap-1">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        onClick={onConfirm}
        data-testid="participant-remove-confirm"
      >
        Remove
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAsking(false)}
        data-testid="participant-remove-cancel"
      >
        Cancel
      </Button>
    </span>
  );
}
