import { HandshakeCodeError } from '@/core/handshake/handshake-code';
import { SessionError } from '@/core/session/session-error';
import { APP_NAME } from '@/core/app-name';

/** Turns any error into a sentence the user can act on. */
export function describeError(error: unknown): string {
  if (error instanceof HandshakeCodeError) {
    switch (error.reason) {
      case 'empty':
        return 'Please paste a code first.';
      case 'wrong-kind':
        return `${error.message} Check that you pasted the right code.`;
      case 'unsupported-version':
        return `This code comes from a different ${APP_NAME} version. Both of you need the same version.`;
      case 'malformed':
        return 'This code is incomplete or damaged. Copy it again in full.';
    }
  }
  if (error instanceof SessionError) {
    switch (error.reason) {
      case 'connection-failed':
        return (
          'No direct connection could be established. One of you may be behind a strict ' +
          'firewall, a VPN or carrier-grade NAT. Create a new invitation to try again; the ' +
          'technical details below say which side had no public address.'
        );
      case 'wrong-invitation':
        return 'This reply belongs to another invitation. Paste it into the card of the invitation you sent to that person.';
      case 'unknown-invitation':
        return 'This reply does not match an open invitation. It may have been used or cancelled already.';
      default:
        return error.message;
    }
  }
  return 'Something went wrong. Please try again.';
}
