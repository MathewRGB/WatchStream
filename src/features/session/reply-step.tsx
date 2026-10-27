import { useEffect, useState } from 'react';
import { Clipboard, ClipboardCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CandidateSummary } from '@/core/peer/candidates';
import { CodeBox } from './code-box';
import { NoPublicAddressNotice } from './no-public-address-notice';

interface ReplyStepProps {
  hostName: string;
  replyCode: string;
  /** The reply code was put on the clipboard automatically. */
  copied: boolean;
  candidates: CandidateSummary;
  /** How long to wait before suggesting a new try. */
  hintAfterMs?: number;
}

const DEFAULT_HINT_AFTER_MS = 60_000;

/** The viewer waits here until the host has pasted the reply code. */
export function ReplyStep({
  hostName,
  replyCode,
  copied,
  candidates,
  hintAfterMs = DEFAULT_HINT_AFTER_MS,
}: ReplyStepProps) {
  const [waitedLong, setWaitedLong] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedLong(true), hintAfterMs);
    return () => clearTimeout(timer);
  }, [hintAfterMs]);

  return (
    <Card data-testid="reply-step">
      <CardHeader>
        <CardTitle>Send your reply</CardTitle>
        <CardDescription data-testid="viewer-state">
          Waiting for {hostName} to paste your reply code…
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert data-testid="reply-copy-notice">
          {copied ? <ClipboardCheck /> : <Clipboard />}
          <AlertDescription>
            {copied
              ? `Reply code copied to your clipboard. Paste it into your chat with ${hostName}.`
              : `Copy the reply code below and send it to ${hostName}.`}
          </AlertDescription>
        </Alert>
        <CodeBox
          label="Send this reply code back to the host"
          code={replyCode}
          testId="reply-code"
          initiallyCopied={copied}
          emphasizeCopy={!copied}
        />
        <NoPublicAddressNotice candidates={candidates} />
        {waitedLong && (
          <p className="text-sm text-muted-foreground" data-testid="still-waiting">
            Still waiting? If {hostName} sees an error, choose Leave and join again with a new
            invitation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
