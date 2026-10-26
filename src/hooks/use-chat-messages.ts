import { useEffect, useState } from 'react';
import type { ChatMessage } from '@/core/protocol/messages';

interface ChatSource {
  events: { on(event: 'chat', listener: (message: ChatMessage) => void): () => void };
}

/** Collects every chat message the session delivers while the component is mounted. */
export function useChatMessages(session: ChatSource): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(
    () => session.events.on('chat', (message) => setMessages((current) => [...current, message])),
    [session],
  );

  return messages;
}
