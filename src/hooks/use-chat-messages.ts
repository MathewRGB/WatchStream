import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/core/protocol/messages';

/** The chat keeps this many messages; each one after that makes the oldest be forgotten. */
export const MAX_KEPT_MESSAGES = 500;

interface ChatSource {
  events: { on(event: 'chat', listener: (message: ChatMessage) => void): () => void };
}

export interface ChatLog {
  /** The latest messages, oldest first, at most `MAX_KEPT_MESSAGES`. */
  messages: ChatMessage[];
  /**
   * How many messages from somebody else have come in since the chat opened, forgotten ones
   * included. Only those are news to the one who reads, and the number must keep growing when the
   * list is full, or nobody would be told of a message that pushes another one out.
   */
  incoming: number;
}

const EMPTY: ChatLog = { messages: [], incoming: 0 };

/**
 * Collects the chat messages the session delivers while the component is mounted. `selfId` is who
 * reads: their own messages are not counted as incoming.
 */
export function useChatMessages(session: ChatSource, selfId: string | null): ChatLog {
  const [log, setLog] = useState<ChatLog>(EMPTY);
  const self = useRef(selfId);

  useEffect(() => {
    self.current = selfId;
  });

  useEffect(
    () =>
      session.events.on('chat', (message) =>
        setLog((current) => ({
          messages: [...current.messages, message].slice(-MAX_KEPT_MESSAGES),
          incoming: current.incoming + (message.senderId === self.current ? 0 : 1),
        })),
      ),
    [session],
  );

  return log;
}
