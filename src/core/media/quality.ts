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
 * works once per viewer. The host chooses the highest step it wants; the load monitor goes down
 * from there when the host cannot keep up.
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

/** `steps` below `chosen`, never lower than the lowest step. */
export function lowerQuality(chosen: QualityId, steps: number): QualityId {
  const index = QUALITY_PRESETS.findIndex((preset) => preset.id === chosen);
  return QUALITY_PRESETS[Math.max(0, index - Math.max(0, steps))]!.id;
}

/** How many steps `chosen` has below it, that is how far the load monitor can go. */
export function stepsBelow(chosen: QualityId): number {
  return QUALITY_PRESETS.findIndex((preset) => preset.id === chosen);
}
