import { describe, expect, it } from 'vitest';
import { pickAudibleTab, tabSoundSupported, type TabChoice } from './tab-sound';

describe('tabSoundSupported', () => {
  it('is false, and does not throw, on a page without extension APIs', () => {
    expect(() => tabSoundSupported()).not.toThrow();
    expect(tabSoundSupported()).toBe(false);
  });
});

const tab = (id: number, windowId: number, audible: boolean): TabChoice => ({
  id,
  windowId,
  audible,
  title: `Tab ${id}`,
  origin: 'https://example.org',
});

describe('pickAudibleTab', () => {
  it('takes the only tab that plays sound', () => {
    expect(pickAudibleTab([tab(1, 1, false), tab(2, 2, true)], 1)?.id).toBe(2);
  });

  it('takes the one in the host window when several play sound', () => {
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 2, true)], 2)?.id).toBe(2);
  });

  it('gives up when it cannot tell', () => {
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 1, true)], 1)).toBeNull();
    expect(pickAudibleTab([tab(1, 1, true), tab(2, 2, true)])).toBeNull();
    expect(pickAudibleTab([tab(1, 1, false)], 1)).toBeNull();
  });
});
