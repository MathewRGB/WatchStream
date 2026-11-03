// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PLAYOUT_BUFFER_OPTIONS } from '@/core/media/playout-buffer';
import { ViewerSettingsTab } from './viewer-settings-tab';

describe('ViewerSettingsTab', () => {
  it('offers every buffer length and marks the current one', () => {
    render(<ViewerSettingsTab buffer="short" onBufferChange={() => {}} />);

    for (const option of PLAYOUT_BUFFER_OPTIONS) {
      expect(screen.getByTestId(`playout-buffer-${option.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('playout-buffer-short')).toBeChecked();
    expect(screen.getByTestId('playout-buffer-standard')).not.toBeChecked();
  });

  it('reports the choice', async () => {
    const onBufferChange = vi.fn();
    render(<ViewerSettingsTab buffer="standard" onBufferChange={onBufferChange} />);

    await userEvent.click(screen.getByTestId('playout-buffer-medium'));

    expect(onBufferChange).toHaveBeenCalledWith('medium');
  });
});
