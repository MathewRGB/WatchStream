import { QUALITY_PRESETS, type QualityId } from '@/core/media/quality';
import type { TabSoundControls } from '@/hooks/use-tab-sound';
import { cn } from '@/lib/utils';
import { TabSoundSection } from './tab-sound-section';

interface SettingsTabProps {
  quality: QualityId;
  onQualityChange: (id: QualityId) => void;
  /** Given where the browser shares no tab sound itself (Firefox). */
  tabSound?: TabSoundControls;
}

/** Host-only options: how much of the shared picture goes out, and where the sound comes from. */
export function SettingsTab({ quality, onQualityChange, tabSound }: SettingsTabProps) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3" data-testid="quality-options">
        <legend className="mb-1 text-sm font-medium">Picture quality</legend>
        <p className="text-sm text-muted-foreground">
          Your upload connection limits what viewers get. You send a separate copy to each viewer,
          and the change applies at once, also while sharing.
        </p>
        <p className="text-sm text-muted-foreground" data-testid="quality-automatic-note">
          This is the most that is sent. With many viewers, if your computer or connection cannot
          keep up, WatchStream lowers it by itself and raises it again later. The line on the stage
          shows what is sent.
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
      {tabSound && <TabSoundSection sound={tabSound} />}
    </div>
  );
}
