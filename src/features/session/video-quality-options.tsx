import { useId } from 'react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  autoVideoBitrate,
  CUSTOM_AUDIO_BITRATES_BPS,
  CUSTOM_FRAMERATES,
  CUSTOM_HEIGHTS,
  CUSTOM_VIDEO_BITRATES_BPS,
  DEFAULT_QUALITY,
  QUALITY_PRESETS,
  resolveLimits,
  type CustomQuality,
  type QualityChoice,
} from '@/core/media/quality';
import { cn } from '@/lib/utils';
import { formatBitrate, uploadPerViewer } from './describe-quality';

interface VideoQualityOptionsProps {
  quality: QualityChoice;
  custom: CustomQuality;
  onQualityChange: (choice: QualityChoice) => void;
  onCustomChange: (changes: Partial<CustomQuality>) => void;
}

const AUTOMATIC = 'auto';

/**
 * The picture and sound quality. For those who do not want to think about it, four steps from
 * "Minimal" to "Sharp"; for those who do, "Custom" opens the resolution, the frame rate and the
 * bitrates one by one. Either way, this is what is sent.
 */
export function VideoQualityOptions({
  quality,
  custom,
  onQualityChange,
  onCustomChange,
}: VideoQualityOptionsProps) {
  const limits = resolveLimits(quality, custom);

  return (
    <fieldset className="flex flex-col gap-2" data-testid="quality-options">
      <legend className="sr-only">Picture quality</legend>
      <p className="text-sm" data-testid="quality-summary">
        Sends {limits.maxHeight}p at up to {limits.maxFramerate} fps: about{' '}
        {formatBitrate(uploadPerViewer(limits))} of upload for each viewer.
      </p>
      <p className="text-xs text-muted-foreground" data-testid="quality-automatic-note">
        Your upload limits what viewers get: you send a separate copy to each. A change applies at
        once, also while sharing. This is what is sent; if your computer or connection cannot keep
        up, WatchP2PStream tells you on the stage and keeps the quality you chose.
      </p>
      {QUALITY_PRESETS.map((preset) => (
        <ChoiceCard
          key={preset.id}
          name="quality"
          value={preset.id}
          checked={quality === preset.id}
          onSelect={() => onQualityChange(preset.id)}
          label={preset.label}
          description={preset.description}
          badge={preset.id === DEFAULT_QUALITY ? 'Recommended' : undefined}
        />
      ))}
      <ChoiceCard
        name="quality"
        value="custom"
        checked={quality === 'custom'}
        onSelect={() => onQualityChange('custom')}
        label="Custom"
        description="Set the resolution, the frame rate and the bitrates yourself."
      />
      {quality === 'custom' && <CustomControls custom={custom} onChange={onCustomChange} />}
    </fieldset>
  );
}

interface ChoiceCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  label: string;
  description: string;
  badge?: string;
}

function ChoiceCard({
  name,
  value,
  checked,
  onSelect,
  label,
  description,
  badge,
}: ChoiceCardProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 has-[:focus-visible]:ring-2',
        checked && 'border-primary bg-primary/5',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1"
        data-testid={`${name}-${value}`}
      />
      <span className="flex flex-col">
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function CustomControls({
  custom,
  onChange,
}: {
  custom: CustomQuality;
  onChange: (changes: Partial<CustomQuality>) => void;
}) {
  const automatic = autoVideoBitrate(custom.maxHeight, custom.maxFramerate);

  return (
    <div
      className="grid gap-4 rounded-md border bg-muted/30 p-3 sm:grid-cols-2"
      data-testid="custom-quality"
    >
      <Field
        label="Resolution"
        hint="The picture is scaled down to this height, never up."
        testId="custom-height"
        value={String(custom.maxHeight)}
        onChange={(value) => onChange({ maxHeight: Number(value) })}
        options={CUSTOM_HEIGHTS.map((height) => ({ value: String(height), label: `${height}p` }))}
      />
      <Field
        label="Frame rate"
        hint="Smoother motion needs more upload and a stronger computer. 60 fps only helps if what you share runs at 60."
        testId="custom-framerate"
        value={String(custom.maxFramerate)}
        onChange={(value) => onChange({ maxFramerate: Number(value) })}
        options={CUSTOM_FRAMERATES.map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
      />
      <Field
        label="Picture bitrate"
        hint={`The most one viewer receives of the picture. Automatic follows the resolution and the frame rate (now ${formatBitrate(automatic)}).`}
        testId="custom-bitrate"
        value={custom.maxBitrateBps === null ? AUTOMATIC : String(custom.maxBitrateBps)}
        onChange={(value) =>
          onChange({ maxBitrateBps: value === AUTOMATIC ? null : Number(value) })
        }
        options={[
          { value: AUTOMATIC, label: 'Automatic' },
          ...CUSTOM_VIDEO_BITRATES_BPS.map((bps) => ({
            value: String(bps),
            label: formatBitrate(bps),
          })),
        ]}
      />
      <Field
        label="Sound bitrate"
        hint="Stereo. 128 kbit/s sounds clean for most music; more helps only on good speakers."
        testId="custom-audio-bitrate"
        value={String(custom.maxAudioBitrateBps)}
        onChange={(value) => onChange({ maxAudioBitrateBps: Number(value) })}
        options={CUSTOM_AUDIO_BITRATES_BPS.map((bps) => ({
          value: String(bps),
          label: formatBitrate(bps),
        }))}
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  hint: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

function Field({ label, hint, testId, value, onChange, options }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={`${id}-hint`}
        data-testid={testId}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}
