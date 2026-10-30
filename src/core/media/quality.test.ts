import { describe, expect, it } from 'vitest';
import {
  autoVideoBitrate,
  changeCustomQuality,
  customFromPreset,
  DEFAULT_QUALITY,
  QUALITY_PRESETS,
  qualityPreset,
  resolveLimits,
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

describe('custom quality', () => {
  it('starts from a step and keeps its resolution, frame rate and sound', () => {
    for (const preset of QUALITY_PRESETS) {
      expect(customFromPreset(preset.id)).toEqual({
        maxHeight: preset.maxHeight,
        maxFramerate: preset.maxFramerate,
        maxBitrateBps: null,
        maxAudioBitrateBps: preset.maxAudioBitrateBps,
      });
    }
  });

  it('follows the resolution and the frame rate with the bitrate, close to the steps', () => {
    for (const preset of QUALITY_PRESETS) {
      const limits = resolveLimits('custom', customFromPreset(preset.id));
      expect(limits.maxBitrateBps / preset.maxBitrateBps).toBeGreaterThan(0.9);
      expect(limits.maxBitrateBps / preset.maxBitrateBps).toBeLessThan(1.1);
      expect(limits.maxHeight).toBe(preset.maxHeight);
      expect(limits.maxFramerate).toBe(preset.maxFramerate);
    }
  });

  it('grows with the frame rate and the resolution, within a floor and a ceiling', () => {
    expect(autoVideoBitrate(720, 60)).toBeGreaterThan(autoVideoBitrate(720, 30));
    expect(autoVideoBitrate(1080, 30)).toBeGreaterThan(autoVideoBitrate(720, 30));
    expect(autoVideoBitrate(240, 10)).toBe(300_000);
    expect(autoVideoBitrate(2160, 60)).toBe(20_000_000);
  });

  it('uses a bitrate the host set, and the steps as they are for a step', () => {
    const custom = changeCustomQuality(customFromPreset('balanced'), { maxBitrateBps: 8_000_000 });

    expect(resolveLimits('custom', custom).maxBitrateBps).toBe(8_000_000);
    expect(resolveLimits('sharp', custom)).toBe(qualityPreset('sharp'));
  });

  it('puts every value on the list it belongs to, whatever it is asked for', () => {
    const changed = changeCustomQuality(customFromPreset('balanced'), {
      maxHeight: 1000,
      maxFramerate: 50,
      maxBitrateBps: 2_400_000,
      maxAudioBitrateBps: 1_000_000,
    });

    expect(changed).toEqual({
      maxHeight: 1080,
      maxFramerate: 60,
      maxBitrateBps: 2_000_000,
      maxAudioBitrateBps: 320_000,
    });
    expect(changeCustomQuality(changed, { maxBitrateBps: null }).maxBitrateBps).toBeNull();
  });

  it('keeps what a change does not name', () => {
    const before = customFromPreset('sharp');

    expect(changeCustomQuality(before, { maxFramerate: 15 })).toEqual({
      ...before,
      maxFramerate: 15,
    });
  });
});
