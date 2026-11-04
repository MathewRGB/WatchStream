/** A change of delay under this many seconds is not made: it is below what anyone could tell. */
export const MIN_CHANGE_SECONDS = 0.005;
/** A change over this many seconds is a cut, not a glide. */
export const JUMP_FROM_SECONDS = 0.3;
/**
 * The most the delay may change per second of playing during a glide. The read position of a delay
 * moves at 1 minus this: 0.05 means the sound plays 5 % slow or fast, a pitch shift of under a
 * semitone that hardly anyone hears. A faster change would play the sound backwards (at 1.0 and
 * over) or smear it.
 */
export const MAX_SLEW = 0.05;

export type DelayChange =
  | { kind: 'none' }
  /** The sound fades out, the delay is set, the sound fades in: a clean cut instead of a scratch. */
  | { kind: 'jump' }
  /** The delay moves to the target at the slew limit, over `seconds`. */
  | { kind: 'glide'; seconds: number };

/**
 * How to get from one delay to another without an audible artefact. Small corrections glide at the
 * slew limit; big ones (the viewer picked another buffer) are a cut with a short fade, because
 * gliding two seconds at 5 % takes forty and the picture jumps at once anyway. Pure.
 */
export function planDelayChange(currentSeconds: number, targetSeconds: number): DelayChange {
  const change = Math.abs(targetSeconds - currentSeconds);
  if (change < MIN_CHANGE_SECONDS) return { kind: 'none' };
  if (change > JUMP_FROM_SECONDS) return { kind: 'jump' };
  return { kind: 'glide', seconds: change / MAX_SLEW };
}
