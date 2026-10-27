import { useState, type ReactNode } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
}

/**
 * One window, no page scrolling: header on top, stage on the left, sidebar on
 * the right. Only inner areas scroll. In a narrow window an open sidebar takes
 * the whole width, so it also fits a browser side panel.
 */
export function AppShell({ title, status, actions, stage, sidebar }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const showSidebar = sidebar !== undefined && sidebarOpen;

  return (
    <div className="flex h-dvh flex-col overflow-hidden" data-testid="app-shell">
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
      <div className="flex min-h-0 flex-1">
        <main className={cn('min-w-0 flex-1', showSidebar && 'max-sm:hidden')}>{stage}</main>
        {showSidebar && (
          <aside
            className="flex w-[22rem] shrink-0 flex-col border-l max-sm:w-full"
            data-testid="sidebar"
          >
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
