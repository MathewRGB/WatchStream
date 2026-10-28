import { useCallback } from 'react';
import type { QualityId } from '@/core/media/quality';
import type { Participant } from '@/core/protocol/messages';
import type { HostSession, IncomingShare, LoadStatus } from '@/core/session/host-session';
import { useChangeCounter, type Subscribe } from './use-change-counter';

export interface HostSnapshot {
  participants: Participant[];
  openSlots: number;
  /** What the host shares right now, or `null`. */
  sharedStream: MediaStream | null;
  /** The picture a viewer shares and the host passes on, or `null` (ADR-0007). */
  incoming: IncomingShare | null;
  /** Viewers who asked to share and wait for the host's answer. */
  shareRequests: Participant[];
  quality: QualityId;
  /** What is really sent, and how the viewers fare. */
  load: LoadStatus;
}

/** The participants and free places of a host session, kept up to date. */
export function useHostSession(session: HostSession): HostSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => {
      const offRoster = session.events.on('roster', onChange);
      const offSlots = session.events.on('slots', onChange);
      const offSharing = session.events.on('sharing', onChange);
      const offQuality = session.events.on('quality', onChange);
      const offLoad = session.events.on('load', onChange);
      const offIncoming = session.events.on('incoming', onChange);
      const offRequests = session.events.on('shareRequests', onChange);
      return () => {
        offRoster();
        offSlots();
        offSharing();
        offQuality();
        offLoad();
        offIncoming();
        offRequests();
      };
    },
    [session],
  );
  useChangeCounter(subscribe);
  return {
    participants: session.participants,
    openSlots: session.openSlots,
    sharedStream: session.sharedStream,
    incoming: session.incoming,
    shareRequests: session.shareRequests,
    quality: session.quality,
    load: session.load,
  };
}
