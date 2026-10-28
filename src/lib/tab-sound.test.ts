import { describe, expect, it } from 'vitest';
import { tabSoundSupported } from './tab-sound';

describe('tabSoundSupported', () => {
  it('is false, and does not throw, on a page without extension APIs', () => {
    expect(() => tabSoundSupported()).not.toThrow();
    expect(tabSoundSupported()).toBe(false);
  });
});
