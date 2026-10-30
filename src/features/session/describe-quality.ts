import { qualityPreset, type MediaLimits, type QualityChoice } from '@/core/media/quality';

/** `3.5 Mbit/s`, `3 Mbit/s`, `600 kbit/s`. */
export function formatBitrate(bps: number): string {
  if (bps >= 1_000_000) return `${Number((bps / 1_000_000).toFixed(1))} Mbit/s`;
  return `${Math.round(bps / 1000)} kbit/s`;
}

/** The name of a choice: a step's label, or "Custom". */
export function qualityName(choice: QualityChoice): string {
  return choice === 'custom' ? 'Custom' : qualityPreset(choice).label;
}

/** `Balanced · 720p, 30 fps`: a choice and what it comes to, in a few words. */
export function describeQuality(choice: QualityChoice, limits: MediaLimits): string {
  return `${qualityName(choice)} · ${limits.maxHeight}p, ${limits.maxFramerate} fps`;
}

/** What one viewer costs in upload at most: the picture and the sound together. */
export function uploadPerViewer(limits: MediaLimits): number {
  return limits.maxBitrateBps + limits.maxAudioBitrateBps;
}
