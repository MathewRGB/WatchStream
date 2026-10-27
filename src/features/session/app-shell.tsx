import { useMemo, useState, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { cn } from '@/lib/utils';
import { StageFullscreenContext } from './stage-fullscreen';

interface AppShellProps {
  title: string;
  /** Short line of status next to the title, e.g. who is hosting. */
  status?: ReactNode;
  /** Buttons at the right end of the header. */
  actions?: ReactNode;
  /** The main area. Fills everything the sidebar leaves free. */
  stage: ReactNode;
  /** Optional right-hand sidebar that can be collapsed. */
  sidebar?: ReactNode;
  /** `data-testid` of the outermost element. */
  testId?: string;
}

/**
 * One window, no page scrolling: header on top, stage on the left, sidebar on
 * the right. Only inner areas scroll. In a narrow window an open sidebar takes
 * the whole width, so it also fits a browser side panel.
 *
 * Full screen takes the workspace (stage and sidebar, not the header). There
 * the sidebar leaves its column and waits off-screen at the right edge; it is
 * the same element, so what is typed in it and where it scrolled survive.
 */
export function AppShell({
  title,
  status,
  actions,
  stage,
  sidebar,
  testId = 'app-shell',
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { ref, active, supported, toggle } = useFullscreen<HTMLDivElement>();
  const fullscreen = useMemo(() => ({ active, supported, toggle }), [active, supported, toggle]);
  const docked = sidebar !== undefined && sidebarOpen && !fullscreen.active;
  const floating = sidebar !== undefined && fullscreen.active;

  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-testid={testId}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <h1 className="text-base font-semibold">{title}</h1>
        {status && <div className="min-w-0 truncate text-sm text-muted-foreground">{status}</div>}
        <div className="ml-auto flex items-center gap-2">
          {actions}
          {sidebar !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
              data-testid="sidebar-toggle"
            >
              {sidebarOpen ? <PanelRightClose /> : <PanelRightOpen />}
            </Button>
          )}
        </div>
      </header>
      {/* Two inset panels with a thin border: scrolling content visibly ends at the panel edge
          instead of looking cut off by the window. */}
      <StageFullscreenContext.Provider value={fullscreen}>
        <div
          ref={ref}
          className={cn(
            'flex min-h-0 flex-1 gap-2 p-2',
            fullscreen.active && 'relative gap-0 overflow-hidden bg-background p-0',
          )}
          data-testid="workspace"
        >
          <main
            className={cn(
              'min-w-0 flex-1 overflow-hidden',
              !fullscreen.active && 'rounded-lg border',
              docked && 'max-sm:hidden',
            )}
            data-testid="stage-panel"
          >
            {stage}
          </main>
          {(docked || floating) && (
            <aside
              className={cn(
                'flex w-[22rem] flex-col overflow-hidden bg-card/40',
                floating
                  ? 'absolute inset-y-0 right-0 z-20 max-w-full translate-x-full border-l bg-card'
                  : 'shrink-0 rounded-lg border max-sm:w-full',
              )}
              // Off-screen and unreachable by keyboard until the next step reveals it.
              inert={floating}
              data-testid="sidebar"
            >
              {sidebar}
            </aside>
          )}
        </div>
      </StageFullscreenContext.Provider>
    </div>
  );
}
