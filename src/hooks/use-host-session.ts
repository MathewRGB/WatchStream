import { useCallback } from 'react';
import type { Participant } from '@/core/protocol/messages';
import type { HostSession } from '@/core/session/host-session';
import { useChangeCounter, type Subscribe } from './use-change-counter';

export interface HostSnapshot {
  participants: Participant[];
  openSlots: number;
}

/** The participants and free places of a host session, kept up to date. */
export function useHostSession(session: HostSession): HostSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => {
      const offRoster = session.events.on('roster', onChange);
      const offSlots = session.events.on('slots', onChange);
      return () => {
        offRoster();
        offSlots();
      };
    },
    [session],
  );
  useChangeCounter(subscribe);
  return { participants: session.participants, openSlots: session.openSlots };
}
