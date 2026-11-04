import { PLAYOUT_BUFFER_OPTIONS, type PlayoutBufferId } from '@/core/media/playout-buffer';
import { OptionGroup } from './choice-card';
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
        <OptionGroup
          name="playout-buffer"
          legend="Smoothing buffer"
          intro="If the picture stutters or freezes, let your browser collect more of it before it plays. Picture and sound are both delayed by the same time. Works in Chrome, Brave and Firefox."
          options={PLAYOUT_BUFFER_OPTIONS}
          value={buffer}
          onChange={onBufferChange}
        />
      </SettingsSection>
    </div>
  );
}
