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

/** Sent by a viewer to the host. */
export type ViewerMessage = { type: 'chat'; text: string };

/** Sent by the host to a viewer. */
export type HostMessage =
  | { type: 'welcome'; participantId: string }
  | { type: 'roster'; participants: Participant[] }
  | { type: 'chat'; message: ChatMessage };

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
