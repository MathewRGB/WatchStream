/**
 * How long the viewer's browser may hold the picture and sound before it plays them. A longer
 * buffer lets late and reordered packets arrive in time, so a jittery long route stutters less,
 * and costs only delay, which matters little when everyone watches the same stream. Chromium's
 * `RTCRtpReceiver.jitterBufferTarget`, in milliseconds, holds the PICTURE back by
 * that time; the browser does not hold the sound back with it, so the stage delays the sound by
 * the same time (`DelayedAudio`). Other browsers ignore the setting.
 */
export type PlayoutBufferId = 'standard' | 'short' | 'medium';

export const DEFAULT_PLAYOUT_BUFFER: PlayoutBufferId = 'standard';

export interface PlayoutBufferOption {
  id: PlayoutBufferId;
  label: string;
  description: string;
  /** The target in milliseconds, or `null` to leave it to the browser. */
  targetMs: number | null;
}

export const PLAYOUT_BUFFER_OPTIONS: readonly PlayoutBufferOption[] = [
  {
    id: 'standard',
    label: 'Standard',
    description: 'The browser decides. Lowest delay.',
    targetMs: null,
  },
  {
    id: 'short',
    label: 'Short (1 s)',
    description: 'Smooths small hiccups for a second of delay.',
    targetMs: 1000,
  },
  {
    id: 'medium',
    label: 'Medium (2 s)',
    description: 'For a long route where the picture stutters or freezes now and then.',
    targetMs: 2000,
  },
];

/**
 * Whether this browser holds the picture back at all. Where it does not, the sound must not be
 * delayed either, or it would play late against a picture that is not.
 */
export function playoutBufferSupported(): boolean {
  return typeof RTCRtpReceiver !== 'undefined' && 'jitterBufferTarget' in RTCRtpReceiver.prototype;
}

export function playoutBufferTarget(id: PlayoutBufferId): number | null {
  return PLAYOUT_BUFFER_OPTIONS.find((option) => option.id === id)?.targetMs ?? null;
}

export function isPlayoutBufferId(value: unknown): value is PlayoutBufferId {
  return PLAYOUT_BUFFER_OPTIONS.some((option) => option.id === value);
}
