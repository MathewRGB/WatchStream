import { describe, expect, it } from 'vitest';
import { isSessionDescription, MAX_SDP_LENGTH } from './session-description';

describe('isSessionDescription', () => {
  it('accepts a description that starts with the version line', () => {
    expect(isSessionDescription('v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n')).toBe(true);
  });

  it('refuses anything else, and a description that is too long', () => {
    expect(isSessionDescription('hello')).toBe(false);
    expect(isSessionDescription(42)).toBe(false);
    expect(isSessionDescription(`v=0${'x'.repeat(MAX_SDP_LENGTH)}`)).toBe(false);
  });
});
