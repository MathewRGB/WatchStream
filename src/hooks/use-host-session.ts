import { useCallback } from 'react';
import type { CustomQuality, MediaLimits, QualityChoice } from '@/core/media/quality';
import type { ReceiveReport } from '@/core/peer/receive-stats';
import type { CodecId } from '@/core/peer/video-codecs';
import type { Participant } from '@/core/protocol/messages';
import type { HostSession, IncomingShare, LoadStatus } from '@/core/session/host-session';
import { onAnyOf, useChangeCounter, type Subscribe } from './use-change-counter';

/** Every event that changes something in the snapshot. */
const EVENTS = [
  'roster',
  'slots',
  'sharing',
  'quality',
  'codec',
  'load',
  'incoming',
  'shareRequests',
  'receiveReports',
] as const;

export interface HostSnapshot {
  participants: Participant[];
  openSlots: number;
  /** What the host shares right now, or `null`. */
  sharedStream: MediaStream | null;
  /** The picture a viewer shares and the host passes on, or `null`. */
  incoming: IncomingShare | null;
  /** Viewers who asked to share and wait for the host's answer. */
  shareRequests: Participant[];
  /** What the host chose: a step, or `custom`. */
  quality: QualityChoice;
  /** The values of the custom choice. */
  customQuality: CustomQuality;
  /** What is sent. */
  limits: MediaLimits;
  /** The video codec the host chose. */
  codec: CodecId;
  /** What is really sent, and how the viewers fare. */
  load: LoadStatus;
  /** How the picture arrives at each viewer, as the viewers say. */
  receiveReports: ReadonlyMap<string, ReceiveReport>;
}

/** The participants and free places of a host session, kept up to date. */
export function useHostSession(session: HostSession): HostSnapshot {
  const subscribe = useCallback<Subscribe>(
    (onChange) => onAnyOf(session.events, EVENTS, onChange),
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
    customQuality: session.customQuality,
    limits: session.limits,
    codec: session.codec,
    load: session.load,
    receiveReports: session.receiveReports,
  };
}
