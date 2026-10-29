// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QUALITY_PRESETS } from '@/core/media/quality';
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
});
