import { PLAYOUT_BUFFER_OPTIONS, type PlayoutBufferId } from '@/core/media/playout-buffer';
import { cn } from '@/lib/utils';
import { SettingsSection } from './settings-section';

interface ViewerSettingsTabProps {
  buffer: PlayoutBufferId;
  onBufferChange: (id: PlayoutBufferId) => void;
}

/** Options that belong to the viewer's own browser, as opposed to what the host sends. */
export function ViewerSettingsTab({ buffer, onBufferChange }: ViewerSettingsTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <SettingsSection
        id="playout-buffer"
        title="Smoothing buffer"
        summary={PLAYOUT_BUFFER_OPTIONS.find((option) => option.id === buffer)?.label}
        defaultOpen
      >
        <fieldset className="flex flex-col gap-3" data-testid="playout-buffer-options">
          <legend className="sr-only">Smoothing buffer</legend>
          <p className="text-xs text-muted-foreground">
            If the picture stutters or freezes, let your browser collect more of it before it plays.
            Picture and sound stay in step; they are only later than the host&apos;s. Chromium
            browsers only.
          </p>
          {PLAYOUT_BUFFER_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 has-[:focus-visible]:ring-2',
                option.id === buffer && 'border-primary bg-primary/5',
              )}
            >
              <input
                type="radio"
                name="playout-buffer"
                value={option.id}
                checked={option.id === buffer}
                onChange={() => onBufferChange(option.id)}
                className="mt-1"
                data-testid={`playout-buffer-${option.id}`}
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsSection>
    </div>
  );
}
