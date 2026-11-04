import { describe, expect, it, vi } from 'vitest';
import { endAllSessions, trackSession } from './open-sessions';

describe('open sessions', () => {
  it('ends every session that is still tracked, once', () => {
    const first = vi.fn();
    const second = vi.fn();
    trackSession(first);
    trackSession(second);

    endAllSessions();
    endAllSessions();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('does not end a session that was forgotten', () => {
    const end = vi.fn();
    const forget = trackSession(end);

    forget();
    endAllSessions();

    expect(end).not.toHaveBeenCalled();
  });

  it('ends the others when one fails to end', () => {
    const broken = vi.fn(() => {
      throw new Error('already closed');
    });
    const other = vi.fn();
    trackSession(broken);
    trackSession(other);

    expect(() => endAllSessions()).not.toThrow();

    expect(other).toHaveBeenCalledTimes(1);
  });
});
