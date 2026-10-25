import { describe, expect, it } from 'vitest';
import { compress, decompress } from './compression';

describe('compression', () => {
  it('round-trips text including non-ASCII characters', async () => {
    const text = 'Hällo Wörld 🎬 '.repeat(50);
    expect(await decompress(await compress(text), 10_000)).toBe(text);
  });

  it('shrinks repetitive text', async () => {
    const text = 'a=candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host\r\n'.repeat(20);
    expect((await compress(text)).byteLength).toBeLessThan(text.length / 4);
  });

  it('rejects output larger than the limit', async () => {
    const bomb = await compress('x'.repeat(100_000));
    await expect(decompress(bomb, 1_000)).rejects.toThrow(RangeError);
  });

  it('rejects data that is not deflate-raw', async () => {
    await expect(decompress(Uint8Array.from([1, 2, 3, 4, 5]), 1_000)).rejects.toThrow();
  });
});
