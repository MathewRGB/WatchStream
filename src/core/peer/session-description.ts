/** The longest session description a code or a message may carry; real ones are a few kilobytes. */
export const MAX_SDP_LENGTH = 20_000;

/** Looks like a session description (it starts with the version line) and is not too long. */
export function isSessionDescription(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('v=0') && value.length <= MAX_SDP_LENGTH;
}
