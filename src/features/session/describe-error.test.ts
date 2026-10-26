import { describe, expect, it } from 'vitest';
import { HandshakeCodeError, type HandshakeCodeErrorReason } from '@/core/handshake/handshake-code';
import { SessionError } from '@/core/session/session-error';
import { describeError } from './describe-error';

describe('describeError', () => {
  it.each<[HandshakeCodeErrorReason, string]>([
    ['empty', 'paste a code first'],
    ['wrong-kind', 'right code'],
    ['unsupported-version', 'different WatchStream version'],
    ['malformed', 'incomplete or damaged'],
  ])('explains a code that is %s', (reason, expected) => {
    expect(describeError(new HandshakeCodeError(reason, 'Expected a reply code.'))).toContain(
      expected,
    );
  });

  it('adds a hint to the wrong-kind message', () => {
    const error = new HandshakeCodeError('wrong-kind', 'Expected a reply code.');

    expect(describeError(error)).toBe(
      'Expected a reply code. Check that you pasted the right code.',
    );
  });

  it('explains a failed connection', () => {
    expect(describeError(new SessionError('connection-failed', 'x'))).toContain(
      'No direct connection',
    );
  });

  it('explains a reply that matches no invitation', () => {
    expect(describeError(new SessionError('unknown-invitation', 'x'))).toContain(
      'does not match an open invitation',
    );
  });

  it.each(['session-full', 'invalid-message', 'not-connected'] as const)(
    'passes on the message of a %s error',
    (reason) => {
      expect(describeError(new SessionError(reason, 'The original message.'))).toBe(
        'The original message.',
      );
    },
  );

  it('gives a generic hint for anything else', () => {
    expect(describeError(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(describeError('boom')).toBe('Something went wrong. Please try again.');
  });
});
