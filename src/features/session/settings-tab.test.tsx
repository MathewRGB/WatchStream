// @vitest-environment happy-dom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { customFromPreset, QUALITY_PRESETS } from '@/core/media/quality';
import { CODEC_OPTIONS } from '@/core/peer/video-codecs';
import type { TabSoundControls } from '@/hooks/use-tab-sound';
import { SettingsTab } from './settings-tab';

type Props = Parameters<typeof SettingsTab>[0];

function renderTab(overrides: Partial<Props> = {}) {
  const props: Props = {
    quality: 'balanced',
    custom: customFromPreset('balanced'),
    onQualityChange: () => {},
    onCustomChange: () => {},
    ...overrides,
  };
  return render(<SettingsTab {...props} />);
}

const toggle = (id: string) => screen.getByTestId(`settings-section-${id}-toggle`);

describe('SettingsTab', () => {
  describe('quality', () => {
    it('offers every preset and Custom, and marks the current one', () => {
      renderTab();

      for (const preset of QUALITY_PRESETS) {
        expect(screen.getByTestId(`quality-${preset.id}`)).toBeInTheDocument();
      }
      expect(screen.getByTestId('quality-custom')).toBeInTheDocument();
      expect(screen.getByTestId('quality-balanced')).toBeChecked();
      expect(screen.getByTestId('quality-sharp')).not.toBeChecked();
      expect(screen.getByTestId('quality-custom')).not.toBeChecked();
    });

    it('recommends Balanced to those who do not know which to take', () => {
      renderTab();

      expect(screen.getByText('Recommended')).toBeInTheDocument();
      expect(
        within(screen.getByTestId('quality-balanced').closest('label')!).getByText('Recommended'),
      ).toBeInTheDocument();
    });

    it('says that the quality is what is sent and is never changed by itself', () => {
      renderTab();

      expect(screen.getByTestId('quality-automatic-note')).toHaveTextContent(
        /is what is sent.*keeps the quality you chose/,
      );
    });

    it('offers Minimal as the lowest step', () => {
      renderTab();

      expect(screen.getAllByRole('radio')[0]).toBe(screen.getByTestId('quality-minimal'));
    });

    it('reports the choice the host makes', async () => {
      const onChange = vi.fn();
      renderTab({ onQualityChange: onChange });

      await userEvent.click(screen.getByTestId('quality-saver'));
      await userEvent.click(screen.getByTestId('quality-custom'));

      expect(onChange.mock.calls).toEqual([['saver'], ['custom']]);
    });

    it('says what is sent and what one viewer costs in upload', () => {
      renderTab();

      expect(screen.getByTestId('quality-summary')).toHaveTextContent(
        'Sends 720p at up to 30 fps: about 3.6 Mbit/s of upload for each viewer.',
      );
    });
  });

  describe('custom quality', () => {
    it('shows no fine-tuning while a preset is chosen', () => {
      renderTab();

      expect(screen.queryByTestId('custom-quality')).toBeNull();
    });

    it('shows the values to set once Custom is chosen, with the current ones selected', () => {
      renderTab({
        quality: 'custom',
        custom: {
          maxHeight: 1080,
          maxFramerate: 60,
          maxBitrateBps: 8_000_000,
          maxAudioBitrateBps: 192_000,
        },
      });

      expect(screen.getByTestId('quality-custom')).toBeChecked();
      expect(screen.getByTestId('custom-height')).toHaveValue('1080');
      expect(screen.getByTestId('custom-framerate')).toHaveValue('60');
      expect(screen.getByTestId('custom-bitrate')).toHaveValue('8000000');
      expect(screen.getByTestId('custom-audio-bitrate')).toHaveValue('192000');
      expect(screen.getByLabelText('Resolution')).toBe(screen.getByTestId('custom-height'));
      expect(screen.getByTestId('quality-summary')).toHaveTextContent(
        'Sends 1080p at up to 60 fps: about 8.2 Mbit/s of upload for each viewer.',
      );
    });

    it('offers the bitrate as automatic, and says what that comes to for the resolution and frame rate', () => {
      renderTab({ quality: 'custom', custom: customFromPreset('balanced') });

      expect(screen.getByTestId('custom-bitrate')).toHaveValue('auto');
      expect(screen.getByRole('option', { name: 'Automatic' })).toBeInTheDocument();
      expect(screen.getByTestId('custom-bitrate')).toHaveAccessibleDescription(
        /Automatic follows the resolution and the frame rate \(now 3\.5 Mbit\/s\)/,
      );
    });

    it.each([
      ['custom-height', '480', { maxHeight: 480 }],
      ['custom-framerate', '15', { maxFramerate: 15 }],
      ['custom-bitrate', '4000000', { maxBitrateBps: 4_000_000 }],
      ['custom-bitrate', 'auto', { maxBitrateBps: null }],
      ['custom-audio-bitrate', '96000', { maxAudioBitrateBps: 96_000 }],
    ])('reports a change of %s to %s', async (testId, value, expected) => {
      const onCustomChange = vi.fn();
      renderTab({
        quality: 'custom',
        custom: { ...customFromPreset('balanced'), maxBitrateBps: 6_000_000 },
        onCustomChange,
      });

      await userEvent.selectOptions(screen.getByTestId(testId), value);

      expect(onCustomChange).toHaveBeenCalledWith(expected);
    });

    it('offers resolutions from 240p to 2160p and frame rates up to 60', () => {
      renderTab({ quality: 'custom', custom: customFromPreset('balanced') });

      const heights = within(screen.getByTestId('custom-height')).getAllByRole('option');
      const rates = within(screen.getByTestId('custom-framerate')).getAllByRole('option');

      expect(heights.at(0)).toHaveTextContent('240p');
      expect(heights.at(-1)).toHaveTextContent('2160p');
      expect(rates.at(-1)).toHaveTextContent('60 fps');
    });
  });

  describe('sections', () => {
    it('opens the picture quality and keeps the others closed, each with what is set in it', () => {
      renderTab({
        codec: 'h264',
        codecOptions: CODEC_OPTIONS.filter((o) => ['auto', 'h264'].includes(o.id)),
        onCodecChange: () => {},
      });

      expect(screen.getByTestId('quality-options')).toBeInTheDocument();
      expect(screen.queryByTestId('codec-options')).toBeNull();
      expect(screen.getByTestId('settings-section-quality-summary')).toHaveTextContent(
        'Balanced · 720p, 30 fps',
      );
      expect(screen.getByTestId('settings-section-codec-summary')).toHaveTextContent('H.264');
    });

    it('opens a closed section and closes an open one, each on its own', async () => {
      renderTab({
        codecOptions: CODEC_OPTIONS.filter((o) => ['auto', 'h264'].includes(o.id)),
        onCodecChange: () => {},
      });

      await userEvent.click(toggle('codec'));
      expect(screen.getByTestId('codec-options')).toBeInTheDocument();
      expect(screen.getByTestId('quality-options')).toBeInTheDocument();

      await userEvent.click(toggle('quality'));
      expect(screen.queryByTestId('quality-options')).toBeNull();
      expect(screen.getByTestId('codec-options')).toBeInTheDocument();

      await userEvent.click(toggle('quality'));
      expect(screen.getByTestId('quality-options')).toBeInTheDocument();
    });

    it('says in the title bar of a closed section what Custom comes to', () => {
      renderTab({
        quality: 'custom',
        custom: { ...customFromPreset('sharp'), maxFramerate: 60 },
      });

      expect(screen.getByTestId('settings-section-quality-summary')).toHaveTextContent(
        'Custom · 1080p, 60 fps',
      );
    });

    it('can be operated from the keyboard', async () => {
      renderTab();

      toggle('quality').focus();
      await userEvent.keyboard('{Enter}');

      expect(screen.queryByTestId('quality-options')).toBeNull();
      expect(toggle('quality')).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('codec', () => {
    const options = CODEC_OPTIONS.filter((o) => ['auto', 'h264', 'vp9'].includes(o.id));

    it('offers the codecs the browser lists and marks the current one', async () => {
      renderTab({ codec: 'h264', codecOptions: options, onCodecChange: () => {} });
      await userEvent.click(toggle('codec'));

      expect(screen.getByTestId('codec-h264')).toBeChecked();
      expect(screen.getByTestId('codec-vp9')).not.toBeChecked();
      expect(screen.queryByTestId('codec-av1')).toBeNull();
    });

    it('reports the codec the host chooses', async () => {
      const onCodecChange = vi.fn();
      renderTab({ codec: 'auto', codecOptions: options, onCodecChange });
      await userEvent.click(toggle('codec'));

      await userEvent.click(screen.getByTestId('codec-vp9'));

      expect(onCodecChange).toHaveBeenCalledWith('vp9');
    });

    it('shows no section where the browser takes no choice', () => {
      renderTab();

      expect(screen.queryByTestId('settings-section-codec')).toBeNull();
    });
  });

  describe('sound from a tab', () => {
    const sound = (overrides: Partial<TabSoundControls> = {}): TabSoundControls => ({
      supported: true,
      choices: null,
      activeTitle: null,
      starting: false,
      error: null,
      openChooser: async () => {},
      closeChooser: () => {},
      choose: async () => {},
      stop: () => {},
      soundTrack: () => null,
      prepareAuto: async () => {},
      autoSoundTrack: async () => null,
      ...overrides,
    });

    it('is a section of its own, only where the browser needs it', async () => {
      renderTab();
      expect(screen.queryByTestId('settings-section-tab-sound')).toBeNull();
    });

    it('says in its title bar which tab the sound comes from, or that none is set', async () => {
      const { unmount } = renderTab({ tabSound: sound() });
      expect(screen.getByTestId('settings-section-tab-sound-summary')).toHaveTextContent('Not set');
      unmount();

      renderTab({ tabSound: sound({ activeTitle: 'A film' }) });
      expect(screen.getByTestId('settings-section-tab-sound-summary')).toHaveTextContent('A film');
    });

    it('opens to the button that chooses a tab', async () => {
      renderTab({ tabSound: sound() });
      expect(screen.queryByTestId('tab-sound-open')).toBeNull();

      await userEvent.click(toggle('tab-sound'));

      expect(screen.getByTestId('tab-sound-open')).toBeInTheDocument();
    });
  });
});
