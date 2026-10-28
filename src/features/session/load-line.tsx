import type { LoadStatus } from '@/core/session/host-session';
import { cn } from '@/lib/utils';
import { describeLoad } from './describe-load';

/** What the host sends and to how many, on the stage; says so when the quality had to go down. */
export function LoadLine({ load }: { load: LoadStatus }) {
  const { text, tone } = describeLoad(load);
  return (
    <p
      role="status"
      className={cn(
        'rounded-md bg-background/70 px-2 py-1 text-sm',
        tone === 'normal' && 'text-muted-foreground',
        tone === 'lowered' && 'text-foreground',
        tone === 'overloaded' && 'text-destructive',
      )}
      data-tone={tone}
      data-testid="load-line"
    >
      {text}
    </p>
  );
}
