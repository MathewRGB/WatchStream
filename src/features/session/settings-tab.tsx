import { resolveLimits, type CustomQuality, type QualityChoice } from '@/core/media/quality';
import type { CodecId, CodecOption } from '@/core/peer/video-codecs';
import type { TabSoundControls } from '@/hooks/use-tab-sound';
import { cn } from '@/lib/utils';
import { describeQuality } from './describe-quality';
import { SettingsSection } from './settings-section';
import { TabSoundSection } from './tab-sound-section';
import { VideoQualityOptions } from './video-quality-options';

interface SettingsTabProps {
  quality: QualityChoice;
  /** The values of the custom choice; they count while `quality` is `custom`. */
  custom: CustomQuality;
  onQualityChange: (choice: QualityChoice) => void;
  onCustomChange: (changes: Partial<CustomQuality>) => void;
  /** Given where the browser shares no tab sound itself (Firefox). */
  tabSound?: TabSoundControls;
  /** The codec the host chose, and the choices this browser can offer; none, no section. */
  codec?: CodecId;
  codecOptions?: readonly CodecOption[];
  onCodecChange?: (id: CodecId) => void;
}

/**
 * Host-only options, one section for each kind, closed but for the picture quality: how much of
 * the shared picture goes out, how it is compressed, and where the sound comes from.
 */
export function SettingsTab({
  quality,
  custom,
  onQualityChange,
  onCustomChange,
  tabSound,
  codec = 'auto',
  codecOptions = [],
  onCodecChange,
}: SettingsTabProps) {
  const chosenCodec = codecOptions.find((option) => option.id === codec);
  return (
    <div className="flex flex-col gap-3">
      <SettingsSection
        id="quality"
        title="Picture quality"
        summary={describeQuality(quality, resolveLimits(quality, custom))}
        defaultOpen
      >
        <VideoQualityOptions
          quality={quality}
          custom={custom}
          onQualityChange={onQualityChange}
          onCustomChange={onCustomChange}
        />
      </SettingsSection>
      {onCodecChange && codecOptions.length > 1 && (
        <SettingsSection id="codec" title="Video codec" summary={chosenCodec?.label}>
          <fieldset className="flex flex-col gap-3" data-testid="codec-options">
            <legend className="sr-only">Video codec</legend>
            <p className="text-xs text-muted-foreground">
              How the picture is compressed. Viewers whose browser cannot use your choice get the
              next one automatically. Changing it while sharing restarts the picture for a moment.
            </p>
            {codecOptions.map((option) => (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 has-[:focus-visible]:ring-2',
                  option.id === codec && 'border-primary bg-primary/5',
                )}
              >
                <input
                  type="radio"
                  name="codec"
                  value={option.id}
                  checked={option.id === codec}
                  onChange={() => onCodecChange(option.id)}
                  className="mt-1"
                  data-testid={`codec-${option.id}`}
                />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </SettingsSection>
      )}
      {tabSound && (
        <SettingsSection
          id="tab-sound"
          title="Sound from a tab"
          summary={tabSound.activeTitle ?? 'Not set'}
        >
          <TabSoundSection sound={tabSound} />
        </SettingsSection>
      )}
    </div>
  );
}
