import type { ChatMessage } from '@/core/protocol/messages';

/** How many of the messages come from somebody else. Only those are news to the one who reads. */
export function countIncoming(messages: ChatMessage[], selfId: string | null): number {
  return messages.filter((message) => message.senderId !== selfId).length;
}
