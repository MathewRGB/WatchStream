import { describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY, QUALITY_PRESETS, qualityPreset, type QualityId } from './quality';

describe('quality steps', () => {
  it('runs from Minimal to Sharp, each step asking for more of everything it can', () => {
    expect(QUALITY_PRESETS.map((preset) => preset.id)).toEqual([
      'minimal',
      'saver',
      'balanced',
      'sharp',
    ]);
    for (let i = 1; i < QUALITY_PRESETS.length; i++) {
      const lower = QUALITY_PRESETS[i - 1]!;
      const higher = QUALITY_PRESETS[i]!;
      expect(higher.maxBitrateBps).toBeGreaterThan(lower.maxBitrateBps);
      expect(higher.maxHeight).toBeGreaterThan(lower.maxHeight);
      expect(higher.maxFramerate).toBeGreaterThanOrEqual(lower.maxFramerate);
      expect(higher.maxAudioBitrateBps).toBeGreaterThanOrEqual(lower.maxAudioBitrateBps);
    }
  });

  it('keeps Minimal cheap for the encoder: about an eighth of Balanced in pixels times frames', () => {
    const cost = (id: QualityId) => {
      const { maxHeight, maxFramerate } = qualityPreset(id);
      return maxHeight ** 2 * maxFramerate;
    };

    expect(cost('minimal') / cost('balanced')).toBeLessThan(0.15);
    expect(qualityPreset('minimal').maxBitrateBps).toBe(600_000);
  });

  it('describes every step and finds it by its id', () => {
    for (const preset of QUALITY_PRESETS) {
      expect(qualityPreset(preset.id)).toBe(preset);
      expect(preset.label).not.toBe('');
      expect(preset.description).not.toBe('');
    }
    expect(DEFAULT_QUALITY).toBe('balanced');
  });
});
