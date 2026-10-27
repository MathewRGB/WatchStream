// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyText } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('writes the text to the clipboard and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyText('WSR1.abc')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('WSR1.abc');
  });

  it('reports failure when the browser refuses', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('NotAllowedError')) },
    });

    await expect(copyText('x')).resolves.toBe(false);
  });

  it('reports failure when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', {});

    await expect(copyText('x')).resolves.toBe(false);
  });
});
