import { describe, expect, it } from 'vitest';
import { decodeBase64Url, encodeBase64Url } from './base64url';

describe('base64url', () => {
  it('round-trips every byte value', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
  });

  it.each([
    [[], ''],
    [[0xfb, 0xff], '-_8'],
    [[0x66, 0x6f, 0x6f], 'Zm9v'],
  ])('encodes %j as %s without padding', (input, expected) => {
    expect(encodeBase64Url(Uint8Array.from(input))).toBe(expected);
  });

  it.each(['a+b', 'a/b', 'abc=', 'a b', 'abcde'])('rejects invalid input %j', (input) => {
    expect(() => decodeBase64Url(input)).toThrow(SyntaxError);
  });
});
