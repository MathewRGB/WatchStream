import { describe, expect, it } from 'vitest';
import { qualityPreset } from '../media/quality';
import { MediaChoices } from './media-choices';

describe('MediaChoices', () => {
  it('starts at Balanced, automatic codec, steady weak-link mode', () => {
    const choices = new MediaChoices();

    expect(choices.quality).toBe('balanced');
    expect(choices.limits).toEqual(qualityPreset('balanced'));
    expect(choices.codec).toBe('auto');
    expect(choices.weakLink).toBe('steady');
  });

  it('starts fine-tuning from the step that was in use', () => {
    const choices = new MediaChoices();
    choices.setQuality('sharp');

    choices.setQuality('custom');

    expect(choices.customQuality).toMatchObject({ maxHeight: 1080, maxFramerate: 30 });
  });

  it('keeps the host`s own custom values when the step is changed and custom chosen again', () => {
    const choices = new MediaChoices();
    choices.setCustomQuality({ maxHeight: 480, maxFramerate: 15 });
    choices.setQuality('sharp');

    choices.setQuality('custom');

    expect(choices.customQuality).toMatchObject({ maxHeight: 480, maxFramerate: 15 });
    expect(choices.limits).toMatchObject({ maxHeight: 480, maxFramerate: 15 });
  });

  it('chooses custom when a custom value is set, snapped to its list', () => {
    const choices = new MediaChoices();

    choices.setCustomQuality({ maxHeight: 700 });

    expect(choices.quality).toBe('custom');
    expect(choices.customQuality.maxHeight).toBe(720);
  });

  it('says whether a codec or a weak-link choice changed anything', () => {
    const choices = new MediaChoices();

    expect(choices.setCodec('auto')).toBe(false);
    expect(choices.setCodec('vp9')).toBe(true);
    expect(choices.setWeakLink('steady')).toBe(false);
    expect(choices.setWeakLink('balanced')).toBe(true);
  });

  it('offers what automatic comes to once the browser said, and the choice itself otherwise', () => {
    const choices = new MediaChoices();
    expect(choices.offeredCodec).toBe('auto');

    expect(choices.noteAutoCodec('vp9')).toBe(true);
    expect(choices.noteAutoCodec('vp9')).toBe(false);
    expect(choices.noteAutoCodec(null)).toBe(false);
    expect(choices.offeredCodec).toBe('vp9');

    choices.setCodec('av1');
    expect(choices.offeredCodec).toBe('av1');
  });
});
