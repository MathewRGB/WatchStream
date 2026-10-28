import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Participant } from '@/core/protocol/messages';
import { StageNote } from './stage-note';

interface ShareRequestNoteProps {
  /** Viewers who asked to share, oldest first. The first one is answered here. */
  requests: Participant[];
  onAllow: (participantId: string) => void;
  onDecline: (participantId: string) => void;
}

/** On the host's stage: who wants to share, and the two answers. The rest wait in the People tab. */
export function ShareRequestNote({ requests, onAllow, onDecline }: ShareRequestNoteProps) {
  const [asking] = requests;
  if (!asking) return null;
  return (
    <StageNote role="status" className="flex items-center gap-2" data-testid="share-request-banner">
      {asking.name} wants to share
      {requests.length > 1 && ` (+${requests.length - 1})`}
      <Button size="sm" onClick={() => onAllow(asking.id)} data-testid="share-allow">
        <Check /> Allow
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDecline(asking.id)}
        data-testid="share-decline"
      >
        <X /> Decline
      </Button>
    </StageNote>
  );
}
