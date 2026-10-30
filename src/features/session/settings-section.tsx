import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Collapsible } from 'radix-ui';

interface SettingsSectionProps {
  /** Names the section in test ids: `settings-section-<id>`. */
  id: string;
  title: string;
  /** What is set, in a few words, shown beside the title while the section is closed. */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * One group of settings that opens and closes by itself, so the tab does not have to be scrolled
 * through. A closed section still says what is set in it.
 */
export function SettingsSection({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: SettingsSectionProps) {
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      className="group/section rounded-md border"
      data-testid={`settings-section-${id}`}
    >
      <Collapsible.Trigger
        className="flex w-full items-center gap-2 rounded-md p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        data-testid={`settings-section-${id}-toggle`}
      >
        <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]/section:rotate-90" />
        <span className="text-sm font-medium">{title}</span>
        {summary && (
          <span
            className="ml-auto min-w-0 truncate text-xs text-muted-foreground group-data-[state=open]/section:hidden"
            data-testid={`settings-section-${id}-summary`}
          >
            {summary}
          </span>
        )}
      </Collapsible.Trigger>
      <Collapsible.Content className="flex flex-col gap-3 border-t p-3">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
