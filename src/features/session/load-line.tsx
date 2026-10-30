import type { LoadStatus } from '@/core/session/host-session';
import { cn } from '@/lib/utils';
import { describeLoad } from './describe-load';
import { StageNote } from './stage-note';

/** What the host sends and to how many, on the stage; says so when the host cannot keep up. */
export function LoadLine({ load }: { load: LoadStatus }) {
  const { text, tone } = describeLoad(load);
  return (
    <StageNote
      role="status"
      className={cn(
        tone === 'normal' && 'text-muted-foreground',
        tone === 'struggling' && 'text-destructive',
      )}
      data-tone={tone}
      title="What is sent: the picture's size and frame rate, the bitrate each viewer really gets of the most it may use, and how many viewers."
      data-testid="load-line"
    >
      {text}
    </StageNote>
  );
}
