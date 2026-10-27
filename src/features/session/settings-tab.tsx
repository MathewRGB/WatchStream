import { QUALITY_PRESETS, type QualityId } from '@/core/media/quality';
import { cn } from '@/lib/utils';

interface SettingsTabProps {
  quality: QualityId;
  onQualityChange: (id: QualityId) => void;
}

/** Host-only options. Today: how much of the shared picture goes out. */
export function SettingsTab({ quality, onQualityChange }: SettingsTabProps) {
  return (
    <fieldset className="flex flex-col gap-3" data-testid="quality-options">
      <legend className="mb-1 text-sm font-medium">Picture quality</legend>
      <p className="text-sm text-muted-foreground">
        Your upload connection limits what viewers get. You send a separate copy to each viewer, and
        the change applies at once, also while sharing.
      </p>
      {QUALITY_PRESETS.map((preset) => (
        <label
          key={preset.id}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[:focus-visible]:ring-2',
            preset.id === quality && 'border-primary bg-primary/5',
          )}
        >
          <input
            type="radio"
            name="quality"
            value={preset.id}
            checked={preset.id === quality}
            onChange={() => onQualityChange(preset.id)}
            className="mt-1"
            data-testid={`quality-${preset.id}`}
          />
          <span className="flex flex-col">
            <span className="font-medium">{preset.label}</span>
            <span className="text-sm text-muted-foreground">{preset.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
