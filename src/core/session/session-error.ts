export type SessionErrorReason =
  | 'session-full'
  | 'unknown-invitation'
  | 'wrong-invitation'
  | 'connection-failed'
  | 'invalid-message'
  | 'not-connected';

export class SessionError extends Error {
  constructor(
    readonly reason: SessionErrorReason,
    message: string,
    /** Technical state for "copy technical details"; never shown as the message itself. */
    readonly details?: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
