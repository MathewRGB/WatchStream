import { useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFullscreen } from '@/hooks/use-fullscreen';
import { useIdle } from '@/hooks/use-idle';
import { useNotice } from '@/hooks/use-notice';
import { SHORTCUT_KEY, useSidebarPeek } from '@/hooks/use-sidebar-peek';
import { cn } from '@/lib/utils';
import { FADE_WHEN_IDLE, HIDE_WHEN_IDLE, StageFullscreenContext } from './stage-fullscreen';

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
  /**
   * How many chat messages from others have come in so far. In full screen each increase shows a
   * small symbol at the edge for a second, unless the sidebar is open and in view.
   */
  incomingMessages?: number;
  /** `data-testid` of the outermost element. */
  testId?: string;
}

/**
 * One window, no page scrolling: header on top, stage on the left, sidebar on
 * the right. Only inner areas scroll. In a narrow window an open sidebar takes
 * the whole width, so it also fits a browser side panel.
 *
 * Full screen takes the workspace (stage and sidebar, not the header). There
 * the sidebar leaves its column and waits off-screen at the right edge until
 * the pointer rests on the handle at the middle of the edge; it is the same element, so what is typed in it
 * and where it scrolled survive. It slides over the picture and does not move it.
 *
 * In full screen, a few seconds without activity leave only the picture: the controls fade out
 * and so does the mouse pointer, and the first move brings them back. The pointer resting on the
 * sidebar counts as activity, because that is someone reading.
 *
 * A message that comes in during full screen is told by a small symbol near the right edge, for
 * one second. It shows even when the controls have faded, and is no activity itself.
 */
export function AppShell({
  title,
  status,
  actions,
  stage,
  sidebar,
  incomingMessages = 0,
  testId = 'app-shell',
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { ref, active, supported, toggle } = useFullscreen<HTMLDivElement>();
  const fullscreen = useMemo(() => ({ active, supported, toggle }), [active, supported, toggle]);
  const docked = sidebar !== undefined && sidebarOpen && !fullscreen.active;
  const floating = sidebar !== undefined && fullscreen.active;
  const peek = useSidebarPeek(floating);
  const { panelRef, hoverProps, focusProps } = peek;
  const idle = useIdle(fullscreen.active, peek.isHovering);
  // An open sidebar in view already shows the message; faded away, it does not.
  const notice = useNotice(incomingMessages, floating && !(peek.open && !idle));

  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-testid={testId}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <img src="/icon/48.png" alt="" aria-hidden="true" className="size-6 shrink-0" />
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
            'group/workspace flex min-h-0 flex-1 gap-2 p-2',
            // `overflow-clip`, not `hidden`: clipped content can still be scrolled by a script,
            // and the sidebar waiting off-screen would pull the picture sideways.
            fullscreen.active && 'relative gap-0 overflow-clip bg-background p-0',
            // The pointer goes too, also over the controls whose own cursor would show it.
            idle && 'cursor-none **:cursor-none!',
          )}
          data-idle={idle}
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
          {floating && (
            <>
              {/* Quiet and out of the way: no text, no clicks. It is not hidden when idle; being
                  seen then is its purpose. */}
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute top-1/2 right-7 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full bg-secondary/80 text-secondary-foreground shadow-md transition-opacity duration-200 motion-reduce:transition-none',
                  notice ? 'opacity-100' : 'opacity-0',
                )}
                data-visible={notice}
                data-testid="chat-notice"
              >
                <MessageSquare className="size-4" />
              </div>
              <span role="status" className="sr-only">
                {notice ? 'New chat message' : ''}
              </span>
            </>
          )}
          {floating && (
            // The way in: the pointer resting on this handle at the middle of the right edge
            // opens the sidebar, the edge as a whole does not (that opened it by accident). It is
            // tinted with the accent colour, half transparent, so it is found without shouting. Also
            // for touch and for screens where the pointer cannot reach this edge (a second
            // monitor on the right). A real button, so the keyboard reaches it too. It stays in
            // the page while the sidebar covers it, only unseen and inert: a pointer that left
            // it must still be told so, and an element that is gone cannot be told anything. The
            // sidebar then believed the pointer was still there and never closed.
            <button
              type="button"
              className={cn(
                'absolute top-1/2 right-0 z-10 flex h-24 w-7 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-primary/40 bg-primary/35 text-primary-foreground opacity-90 shadow-md backdrop-blur-sm hover:opacity-100 focus-visible:opacity-100',
                FADE_WHEN_IDLE,
                peek.open && 'invisible',
              )}
              aria-label="Show sidebar"
              title={`Show sidebar (${SHORTCUT_KEY.toUpperCase()})`}
              onClick={peek.reveal}
              inert={peek.open}
              {...hoverProps}
              data-testid="sidebar-handle"
            >
              {/* The shadow keeps the arrow readable on a bright picture, where the tint is pale. */}
              <ChevronLeft className="size-5 drop-shadow-[0_0_2px_rgb(0_0_0/0.8)]" />
            </button>
          )}
          {(docked || floating) && (
            <aside
              ref={panelRef}
              className={cn(
                'flex w-[22rem] flex-col overflow-hidden bg-card/40',
                floating
                  ? cn(
                      'absolute inset-y-0 right-0 z-20 max-w-full border-l bg-card shadow-xl transition-[transform,opacity] duration-300 motion-reduce:transition-none',
                      HIDE_WHEN_IDLE,
                    )
                  : 'shrink-0 rounded-lg border max-sm:w-full',
                floating && (peek.open ? 'translate-x-0' : 'translate-x-full'),
              )}
              // Closed, it is off-screen and out of keyboard reach.
              inert={floating && !peek.open}
              {...(floating ? { ...hoverProps, ...focusProps } : {})}
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
