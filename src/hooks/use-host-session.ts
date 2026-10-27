import { useCallback } from 'react';
import type { QualityId } from '@/core/media/quality';
import type { Participant } from '@/core/protocol/messages';
import type { HostSession } from '@/core/session/host-session';
import { useChangeCounter, type Subscribe } from './use-change-counter';

export interface HostSnapshot {
  participants: Participant[];
  openSlots: number;
  /** What the host shares right now, or `null`. */
  sharedStream: MediaStream | null;
  quality: QualityId;
}

/** The participants and free places of a host session, kept up to date. */
export function useHostSession(session: HostSession): HostSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => {
      const offRoster = session.events.on('roster', onChange);
      const offSlots = session.events.on('slots', onChange);
      const offSharing = session.events.on('sharing', onChange);
      const offQuality = session.events.on('quality', onChange);
      return () => {
        offRoster();
        offSlots();
        offSharing();
        offQuality();
      };
    },
    [session],
  );
  useChangeCounter(subscribe);
  return {
    participants: session.participants,
    openSlots: session.openSlots,
    sharedStream: session.sharedStream,
    quality: session.quality,
  };
}
