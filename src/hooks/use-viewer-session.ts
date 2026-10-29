import { useCallback } from 'react';
import type { Participant } from '@/core/protocol/messages';
import type {
  ShareEnd,
  ShareState,
  SharedMedia,
  ViewerSession,
  ViewerState,
} from '@/core/session/viewer-session';
import { onAnyOf, useChangeCounter, type Subscribe } from './use-change-counter';

/** Every event that changes something in the snapshot. */
const EVENTS = ['state', 'roster', 'media', 'share'] as const;

export interface ViewerSnapshot {
  state: ViewerState;
  participants: Participant[];
  participantId: string | null;
  /** What the host shares right now, or `null`. */
  media: SharedMedia | null;
  /** The viewer's own share. */
  share: ShareState;
  /** Why the last share did not start or was ended by the host; `null` otherwise. */
  shareEnd: ShareEnd | null;
  /** The viewer's own stream while it waits for the host or is sent. */
  ownShare: MediaStream | null;
}

/** The connection state and participants of a viewer session, kept up to date. */
export function useViewerSession(session: ViewerSession): ViewerSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => onAnyOf(session.events, EVENTS, onChange),
    [session],
  );
  useChangeCounter(subscribe);
  return {
    state: session.state,
    participants: session.participants,
    participantId: session.participantId,
    media: session.media,
    share: session.share,
    shareEnd: session.lastShareEnd,
    ownShare: session.ownShare,
  };
}
