import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatLogHistory } from '@/core/log/logger';
import { copyText } from '@/lib/clipboard';

interface TechnicalDetailsProps {
  /** The state of the failed connection, if there is one. */
  details?: string;
}

/**
 * What a person can paste into a bug report: the state of the connection, the
 * latest log lines and the browser. It holds no codes, addresses, names or chat
 * text; the log is built to never carry them.
 */
export function TechnicalDetails({ details }: TechnicalDetailsProps) {
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = [
    details,
    `Browser: ${navigator.userAgent}`,
    'Recent log (also in the browser console, filter "WatchP2PStream"):',
    formatLogHistory(40) || '(empty)',
  ]
    .filter(Boolean)
    .join('\n\n');

  return (
    <details className="text-sm" data-testid="technical-details">
      <summary className="cursor-pointer text-muted-foreground">Technical details</summary>
      <pre
        className="mt-2 max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 text-xs whitespace-pre-wrap"
        data-testid="technical-details-text"
      >
        {text}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={async () => setCopied((await copyText(text)) ? 'copied' : 'failed')}
        data-testid="technical-details-copy"
      >
        {copied === 'copied' ? <Check /> : <Copy />}
        {copied === 'copied'
          ? 'Copied'
          : copied === 'failed'
            ? 'Copy by hand'
            : 'Copy technical details'}
      </Button>
    </details>
  );
}
