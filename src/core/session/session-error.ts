export type SessionErrorReason =
  'session-full' | 'unknown-invitation' | 'connection-failed' | 'invalid-message' | 'not-connected';

export class SessionError extends Error {
  constructor(
    readonly reason: SessionErrorReason,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}
