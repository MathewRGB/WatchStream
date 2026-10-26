import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MAX_CHAT_LENGTH, type ChatMessage } from '@/core/protocol/messages';
import { cn } from '@/lib/utils';
import { describeError } from './describe-error';

interface ChatPanelProps {
  messages: ChatMessage[];
  selfId: string | null;
  /** Sends the text; throws when it cannot be sent. */
  onSend: (text: string) => void;
  disabled?: boolean;
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

export function ChatPanel({ messages, selfId, onSend, disabled = false }: ChatPanelProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLLIElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === '') return;
    try {
      onSend(text);
      setText('');
      setError(null);
    } catch (caught) {
      setError(describeError(caught));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ol className="flex max-h-80 flex-col gap-2 overflow-y-auto" data-testid="chat-messages">
          {messages.map((message) => {
            const own = message.senderId === selfId;
            return (
              <li
                key={message.id}
                className={cn('border-b pb-2 last:border-b-0', own && 'text-primary')}
                data-testid="chat-message"
                data-own={own}
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold" data-testid="chat-sender">
                    {own ? 'You' : message.senderName}
                  </span>
                  <time className="text-xs text-muted-foreground">
                    {timeFormat.format(message.sentAt)}
                  </time>
                </div>
                <p className="text-foreground [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {message.text}
                </p>
              </li>
            );
          })}
          <li ref={end} aria-hidden />
        </ol>
        <form className="flex gap-2" onSubmit={submit}>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_CHAT_LENGTH}
            placeholder="Write a message"
            aria-label="Message"
            disabled={disabled}
            data-testid="chat-input"
          />
          <Button type="submit" disabled={disabled} data-testid="chat-send">
            <Send />
            Send
          </Button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="chat-status">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
