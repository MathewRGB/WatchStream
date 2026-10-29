// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS } from '@/core/media/quality';
import { CODEC_OPTIONS } from '@/core/peer/video-codecs';
import { SettingsTab } from './settings-tab';

describe('SettingsTab', () => {
  it('offers every quality preset and marks the current one', () => {
    render(<SettingsTab quality="balanced" onQualityChange={() => {}} />);

    for (const preset of QUALITY_PRESETS) {
      expect(screen.getByTestId(`quality-${preset.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('quality-balanced')).toBeChecked();
    expect(screen.getByTestId('quality-sharp')).not.toBeChecked();
  });

  it('says that the quality is what is sent and is never changed by itself', () => {
    render(<SettingsTab quality="balanced" onQualityChange={() => {}} />);

    expect(screen.getByTestId('quality-automatic-note')).toHaveTextContent(
      /is what is sent.*keeps the quality you chose/,
    );
  });

  it('offers Minimal as the lowest step', () => {
    render(<SettingsTab quality="balanced" onQualityChange={() => {}} />);

    expect(screen.getByTestId('quality-minimal')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')[0]).toBe(screen.getByTestId('quality-minimal'));
  });

  it('reports the preset the host chooses', async () => {
    const onChange = vi.fn();
    render(<SettingsTab quality="balanced" onQualityChange={onChange} />);

    await userEvent.click(screen.getByTestId('quality-saver'));

    expect(onChange).toHaveBeenCalledWith('saver');
  });

  describe('codec', () => {
    const options = CODEC_OPTIONS.filter((o) => ['auto', 'h264', 'vp9'].includes(o.id));

    it('offers the codecs the browser lists and marks the current one', () => {
      render(
        <SettingsTab
          quality="balanced"
          onQualityChange={() => {}}
          codec="h264"
          codecOptions={options}
          onCodecChange={() => {}}
        />,
      );

      expect(screen.getByTestId('codec-h264')).toBeChecked();
      expect(screen.getByTestId('codec-vp9')).not.toBeChecked();
      expect(screen.queryByTestId('codec-av1')).toBeNull();
    });

    it('reports the codec the host chooses', async () => {
      const onCodecChange = vi.fn();
      render(
        <SettingsTab
          quality="balanced"
          onQualityChange={() => {}}
          codec="auto"
          codecOptions={options}
          onCodecChange={onCodecChange}
        />,
      );

      await userEvent.click(screen.getByTestId('codec-vp9'));

      expect(onCodecChange).toHaveBeenCalledWith('vp9');
    });

    it('shows no section where the browser takes no choice', () => {
      render(<SettingsTab quality="balanced" onQualityChange={() => {}} />);

      expect(screen.queryByTestId('codec-options')).toBeNull();
    });
  });
});
