/** What a link may send of the shared picture and sound. */
export interface MediaLimits {
  maxBitrateBps: number;
  /** Opus bitrate for the sound; stereo music needs about 128 kbit/s to sound clean. */
  maxAudioBitrateBps: number;
  /** The picture is scaled down to at most this height; it is never scaled up. */
  maxHeight: number;
  maxFramerate: number;
}

export type QualityId = 'minimal' | 'saver' | 'balanced' | 'sharp';

export interface QualityPreset extends MediaLimits {
  id: QualityId;
  label: string;
  description: string;
}

/**
 * The steps, from the lowest to the highest. The host sends one copy of the picture to every
 * viewer, so the upload needed is roughly the bitrate times the number of viewers, and the encoder
 * works once per viewer. The host chooses the step and exactly that is sent. The load monitor says
 * so when the host cannot keep up, and never changes the quality itself.
 */
export const QUALITY_PRESETS: readonly QualityPreset[] = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: '360p, 15 fps, sound 64 kbit/s. For many viewers or a slow computer.',
    maxBitrateBps: 600_000,
    maxAudioBitrateBps: 64_000,
    maxHeight: 360,
    maxFramerate: 15,
  },
  {
    id: 'saver',
    label: 'Saver',
    description: '480p, 24 fps, sound 64 kbit/s. For slow connections.',
    maxBitrateBps: 1_500_000,
    maxAudioBitrateBps: 64_000,
    maxHeight: 480,
    maxFramerate: 24,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '720p, 30 fps, sound 128 kbit/s. Good for most connections.',
    maxBitrateBps: 3_500_000,
    maxAudioBitrateBps: 128_000,
    maxHeight: 720,
    maxFramerate: 30,
  },
  {
    id: 'sharp',
    label: 'Sharp',
    description: '1080p, 30 fps, sound 192 kbit/s. Needs about 6 Mbit/s upload for each viewer.',
    maxBitrateBps: 6_000_000,
    maxAudioBitrateBps: 192_000,
    maxHeight: 1080,
    maxFramerate: 30,
  },
];

export const DEFAULT_QUALITY: QualityId = 'balanced';

export function qualityPreset(id: QualityId): QualityPreset {
  return QUALITY_PRESETS.find((preset) => preset.id === id)!;
}

/** What the host picks in Settings: one of the steps above, or the values it set itself. */
export type QualityChoice = QualityId | 'custom';

/**
 * The values of the `custom` choice, for a host who wants to fine-tune. Every value is one of the
 * lists below, so what a host can set is what the encoder and the screen can reasonably do.
 */
export interface CustomQuality {
  maxHeight: number;
  maxFramerate: number;
  /** The picture's bitrate in bit/s, or `null` to follow the resolution and the frame rate. */
  maxBitrateBps: number | null;
  maxAudioBitrateBps: number;
}

export const CUSTOM_HEIGHTS: readonly number[] = [240, 360, 480, 720, 1080, 1440, 2160];
export const CUSTOM_FRAMERATES: readonly number[] = [10, 15, 24, 30, 60];
export const CUSTOM_VIDEO_BITRATES_BPS: readonly number[] = [
  300_000, 500_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 4_000_000, 6_000_000, 8_000_000,
  12_000_000, 16_000_000, 20_000_000,
];
export const CUSTOM_AUDIO_BITRATES_BPS: readonly number[] = [
  32_000, 64_000, 96_000, 128_000, 192_000, 256_000, 320_000,
];

const MIN_AUTO_BITRATE_BPS = 300_000;
const MAX_AUTO_BITRATE_BPS = 20_000_000;

/**
 * The picture's bitrate for a resolution and a frame rate, when the host does not set one: bits
 * per pixel that fall as the picture grows, as the four steps above already do (360p at 15 fps
 * gets 0.6 Mbit/s, 720p at 30 fps 3.5, 1080p at 30 fps 5.7 against the step's 6). A 16:9 picture.
 */
export function autoVideoBitrate(height: number, framerate: number): number {
  const bitsPerPixel = Math.max(0.05, 0.2 - 0.0001 * height);
  const raw = ((height * 16) / 9) * height * framerate * bitsPerPixel;
  const rounded = Math.round(raw / 50_000) * 50_000;
  return Math.min(MAX_AUTO_BITRATE_BPS, Math.max(MIN_AUTO_BITRATE_BPS, rounded));
}

/** The member of `list` nearest to `value`, so that nothing outside the lists can be set. */
function nearest(list: readonly number[], value: number): number {
  return list.reduce((best, item) =>
    Math.abs(item - value) < Math.abs(best - value) ? item : best,
  );
}

/** The custom values that equal a step, as the place to start fine-tuning from. */
export function customFromPreset(id: QualityId): CustomQuality {
  const { maxHeight, maxFramerate, maxAudioBitrateBps } = qualityPreset(id);
  return { maxHeight, maxFramerate, maxBitrateBps: null, maxAudioBitrateBps };
}

/** `changes` applied to `current`, each value snapped to the list it belongs to. */
export function changeCustomQuality(
  current: CustomQuality,
  changes: Partial<CustomQuality>,
): CustomQuality {
  const next = { ...current, ...changes };
  return {
    maxHeight: nearest(CUSTOM_HEIGHTS, next.maxHeight),
    maxFramerate: nearest(CUSTOM_FRAMERATES, next.maxFramerate),
    maxBitrateBps:
      next.maxBitrateBps === null ? null : nearest(CUSTOM_VIDEO_BITRATES_BPS, next.maxBitrateBps),
    maxAudioBitrateBps: nearest(CUSTOM_AUDIO_BITRATES_BPS, next.maxAudioBitrateBps),
  };
}

/** What the links are limited to for a choice. */
export function resolveLimits(choice: QualityChoice, custom: CustomQuality): MediaLimits {
  if (choice !== 'custom') return qualityPreset(choice);
  return {
    maxBitrateBps: custom.maxBitrateBps ?? autoVideoBitrate(custom.maxHeight, custom.maxFramerate),
    maxAudioBitrateBps: custom.maxAudioBitrateBps,
    maxHeight: custom.maxHeight,
    maxFramerate: custom.maxFramerate,
  };
}
