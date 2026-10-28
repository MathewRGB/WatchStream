import { isSessionDescription } from '../peer/session-description';

/**
 * Messages exchanged over the data channel between host and viewers.
 * The host is authoritative: viewers only send requests, the host decides
 * what everyone sees and broadcasts it.
 */

export type Role = 'host' | 'viewer';

export interface Participant {
  id: string;
  name: string;
  role: Role;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sentAt: number;
}

/** Why the host did not let a viewer share. */
export type ShareDenial = 'declined' | 'busy';

/**
 * Sent by a viewer to the host. In `media-offer` and `media-answer`, `sourceId` is the participant
 * who made the offer: the host for an answer, the viewer itself for an offer.
 */
export type ViewerMessage =
  | { type: 'chat'; text: string }
  | { type: 'media-answer'; sourceId: string; sdp: string }
  /** The viewer holds a stream and asks to share it. */
  | { type: 'share-request' }
  | { type: 'share-stop' }
  | { type: 'media-offer'; sourceId: string; sdp: string };

/** Sent by the host to a viewer. */
export type HostMessage =
  | { type: 'welcome'; participantId: string }
  | { type: 'roster'; participants: Participant[] }
  | { type: 'chat'; message: ChatMessage }
  /**
   * In `media-started` and `media-stopped`, `sourceId` is the participant whose picture it is; in
   * `media-offer`, the host, who made the offer. `media-started` comes before the offer and
   * `media-stopped` ends the share; a viewer shows media only between the two, because the offers
   * that add or remove tracks can also produce track events of their own.
   */
  | { type: 'media-started'; sourceId: string }
  | { type: 'media-offer'; sourceId: string; sdp: string }
  | { type: 'media-stopped'; sourceId: string }
  /** The host removed this viewer; the connection closes right after. */
  | { type: 'removed' }
  | { type: 'share-granted' }
  | { type: 'share-denied'; reason: ShareDenial }
  /** The host ended the share of this viewer. */
  | { type: 'share-revoked' }
  /** The answer to the viewer's own `media-offer`. */
  | { type: 'media-answer'; sourceId: string; sdp: string };

export const MAX_CHAT_LENGTH = 1000;

/** Returns the trimmed text, or `null` when it is empty or too long. */
export function normalizeChatText(text: string): string | null {
  const trimmed = text.trim();
  return trimmed !== '' && trimmed.length <= MAX_CHAT_LENGTH ? trimmed : null;
}

export function serialize(message: HostMessage | ViewerMessage): string {
  return JSON.stringify(message);
}

export function parseViewerMessage(raw: string): ViewerMessage | null {
  const data = parseObject(raw);
  if (data?.type === 'chat' && typeof data.text === 'string') {
    const text = normalizeChatText(data.text);
    return text === null ? null : { type: 'chat', text };
  }
  if (
    data?.type === 'media-answer' &&
    isNonEmptyString(data.sourceId) &&
    isSessionDescription(data.sdp)
  ) {
    return { type: 'media-answer', sourceId: data.sourceId, sdp: data.sdp };
  }
  if (
    data?.type === 'media-offer' &&
    isNonEmptyString(data.sourceId) &&
    isSessionDescription(data.sdp)
  ) {
    return { type: 'media-offer', sourceId: data.sourceId, sdp: data.sdp };
  }
  if (data?.type === 'share-request') return { type: 'share-request' };
  if (data?.type === 'share-stop') return { type: 'share-stop' };
  return null;
}

export function parseHostMessage(raw: string): HostMessage | null {
  const data = parseObject(raw);
  switch (data?.type) {
    case 'welcome':
      return isNonEmptyString(data.participantId)
        ? { type: 'welcome', participantId: data.participantId }
        : null;
    case 'roster':
      return Array.isArray(data.participants) && data.participants.every(isParticipant)
        ? { type: 'roster', participants: data.participants }
        : null;
    case 'chat':
      return isChatMessage(data.message) ? { type: 'chat', message: data.message } : null;
    case 'media-started':
      return isNonEmptyString(data.sourceId)
        ? { type: 'media-started', sourceId: data.sourceId }
        : null;
    case 'media-offer':
      return isNonEmptyString(data.sourceId) && isSessionDescription(data.sdp)
        ? { type: 'media-offer', sourceId: data.sourceId, sdp: data.sdp }
        : null;
    case 'media-stopped':
      return isNonEmptyString(data.sourceId)
        ? { type: 'media-stopped', sourceId: data.sourceId }
        : null;
    case 'removed':
      return { type: 'removed' };
    case 'share-granted':
      return { type: 'share-granted' };
    case 'share-denied':
      return data.reason === 'declined' || data.reason === 'busy'
        ? { type: 'share-denied', reason: data.reason }
        : null;
    case 'share-revoked':
      return { type: 'share-revoked' };
    case 'media-answer':
      return isNonEmptyString(data.sourceId) && isSessionDescription(data.sdp)
        ? { type: 'media-answer', sourceId: data.sourceId, sdp: data.sdp }
        : null;
    default:
      return null;
  }
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(raw);
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isParticipant(value: unknown): value is Participant {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    isNonEmptyString(p.id) && isNonEmptyString(p.name) && (p.role === 'host' || p.role === 'viewer')
  );
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    isNonEmptyString(m.id) &&
    isNonEmptyString(m.senderId) &&
    isNonEmptyString(m.senderName) &&
    typeof m.text === 'string' &&
    normalizeChatText(m.text) === m.text &&
    typeof m.sentAt === 'number' &&
    Number.isFinite(m.sentAt)
  );
}
