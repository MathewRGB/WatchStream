import type { ReactNode } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FADE_WHEN_IDLE, useStageFullscreen } from './stage-fullscreen';

interface StageProps {
  /** What is shown on the stage. Without children an empty state with `emptyMessage` appears. */
  children?: ReactNode;
  emptyMessage: string;
  /** Controls in the top-left corner, e.g. the share button. */
  overlay?: ReactNode;
}

/**
 * The big area for the shared picture. Its full-screen button asks the app shell
 * around it, which puts the whole workspace (stage and sidebar) into full screen.
 */
export function Stage({ children, emptyMessage, overlay }: StageProps) {
  const { active, supported, toggle } = useStageFullscreen();

  return (
    <section className="relative size-full bg-black" data-testid="stage">
      {children ?? (
        <div className="grid size-full place-items-center p-6 text-center text-muted-foreground">
          <p data-testid="stage-empty">{emptyMessage}</p>
        </div>
      )}
      {overlay && (
        // Wraps instead of running under the full-screen button at the other corner.
        <div
          className={cn(
            'absolute top-3 left-3 flex max-w-[calc(100%-4.5rem)] flex-wrap items-center gap-2',
            FADE_WHEN_IDLE,
          )}
        >
          {overlay}
        </div>
      )}
      {supported && (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className={cn('absolute top-3 right-3 opacity-80 hover:opacity-100', FADE_WHEN_IDLE)}
          aria-label={active ? 'Exit full screen' : 'Full screen'}
          title={active ? 'Exit full screen' : 'Full screen'}
          onClick={() => void toggle()}
          data-testid="fullscreen-button"
        >
          {active ? <Minimize /> : <Maximize />}
        </Button>
      )}
    </section>
  );
}
