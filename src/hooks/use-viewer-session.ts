import { useCallback } from 'react';
import type { Participant } from '@/core/protocol/messages';
import type { ViewerSession, ViewerState } from '@/core/session/viewer-session';
import { useChangeCounter, type Subscribe } from './use-change-counter';

export interface ViewerSnapshot {
  state: ViewerState;
  participants: Participant[];
  participantId: string | null;
}

/** The connection state and participants of a viewer session, kept up to date. */
export function useViewerSession(session: ViewerSession): ViewerSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => {
      const offState = session.events.on('state', onChange);
      const offRoster = session.events.on('roster', onChange);
      return () => {
        offState();
        offRoster();
      };
    },
    [session],
  );
  useChangeCounter(subscribe);
  return {
    state: session.state,
    participants: session.participants,
    participantId: session.participantId,
  };
}
