import type { ReactNode } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFullscreen } from '@/hooks/use-fullscreen';

interface StageProps {
  /** What is shown on the stage. Without children an empty state with `emptyMessage` appears. */
  children?: ReactNode;
  emptyMessage: string;
}

/**
 * The big area for the shared picture. It owns the full-screen mode: only the
 * stage fills the screen, the sidebar and header stay out of it.
 */
export function Stage({ children, emptyMessage }: StageProps) {
  const { ref, active, supported, toggle } = useFullscreen<HTMLElement>();

  return (
    <section ref={ref} className="relative size-full bg-black" data-testid="stage">
      {children ?? (
        <div className="grid size-full place-items-center p-6 text-center text-muted-foreground">
          <p data-testid="stage-empty">{emptyMessage}</p>
        </div>
      )}
      {supported && (
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="absolute top-3 right-3 opacity-80 hover:opacity-100"
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
