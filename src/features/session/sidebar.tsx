import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface SidebarTab {
  id: string;
  label: string;
  icon: ReactNode;
  content: ReactNode;
  /** Shown as a small number next to the label, e.g. the participant count. */
  count?: number;
}

interface SidebarProps {
  tabs: SidebarTab[];
  defaultTab: string;
}

/**
 * Tabs for everything beside the stage. All tabs stay mounted and are only
 * hidden, so a half-typed reply code or the chat scroll position survives a
 * switch.
 */
export function Sidebar({ tabs, defaultTab }: SidebarProps) {
  return (
    <Tabs defaultValue={defaultTab} className="min-h-0 flex-1 gap-0">
      <TabsList className="m-2 shrink-0" data-testid="sidebar-tabs">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} data-testid={`tab-${tab.id}`}>
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-xs text-muted-foreground">{tab.count}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.id}
          value={tab.id}
          forceMount
          className="min-h-0 flex-1 overflow-y-auto p-3 data-[state=inactive]:hidden"
          data-testid={`tab-panel-${tab.id}`}
        >
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
