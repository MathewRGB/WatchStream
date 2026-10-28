import { describe, expect, it } from 'vitest';
import {
  DEFAULT_QUALITY,
  lowerQuality,
  QUALITY_PRESETS,
  qualityPreset,
  stepsBelow,
  type QualityId,
} from './quality';

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

describe('lowerQuality', () => {
  it.each<[QualityId, number, QualityId]>([
    ['sharp', 0, 'sharp'],
    ['sharp', 1, 'balanced'],
    ['sharp', 2, 'saver'],
    ['sharp', 3, 'minimal'],
    ['balanced', 1, 'saver'],
    ['saver', 1, 'minimal'],
  ])('%s lowered by %i is %s', (chosen, steps, expected) => {
    expect(lowerQuality(chosen, steps)).toBe(expected);
  });

  it('stops at Minimal, however far it is asked to go', () => {
    expect(lowerQuality('sharp', 10)).toBe('minimal');
    expect(lowerQuality('minimal', 1)).toBe('minimal');
  });

  it('does not go up for a negative number of steps', () => {
    expect(lowerQuality('balanced', -2)).toBe('balanced');
  });
});

describe('stepsBelow', () => {
  it('counts the steps under a step', () => {
    expect(stepsBelow('minimal')).toBe(0);
    expect(stepsBelow('saver')).toBe(1);
    expect(stepsBelow('sharp')).toBe(3);
  });
});
