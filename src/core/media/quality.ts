/** What a link may send of the shared picture. */
export interface VideoLimits {
  maxBitrateBps: number;
  /** The picture is scaled down to at most this height; it is never scaled up. */
  maxHeight: number;
  maxFramerate: number;
}

export type QualityId = 'saver' | 'balanced' | 'sharp';

export interface QualityPreset extends VideoLimits {
  id: QualityId;
  label: string;
  description: string;
}

/**
 * The host sends one copy of the picture to every viewer, so the upload needed
 * is roughly the bitrate times the number of viewers (at most three).
 */
export const QUALITY_PRESETS: readonly QualityPreset[] = [
  {
    id: 'saver',
    label: 'Saver',
    description: '480p, 24 fps. For slow connections.',
    maxBitrateBps: 1_500_000,
    maxHeight: 480,
    maxFramerate: 24,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: '720p, 30 fps. Good for most connections.',
    maxBitrateBps: 3_500_000,
    maxHeight: 720,
    maxFramerate: 30,
  },
  {
    id: 'sharp',
    label: 'Sharp',
    description: '1080p, 30 fps. Needs about 6 Mbit/s upload for each viewer.',
    maxBitrateBps: 6_000_000,
    maxHeight: 1080,
    maxFramerate: 30,
  },
];

export const DEFAULT_QUALITY: QualityId = 'balanced';

export function qualityPreset(id: QualityId): QualityPreset {
  return QUALITY_PRESETS.find((preset) => preset.id === id)!;
}
