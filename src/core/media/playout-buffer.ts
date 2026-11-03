/**
 * How long the viewer's browser may hold the picture and sound before it plays them. A longer
 * buffer lets late and reordered packets arrive in time, so a jittery long route stutters less,
 * and costs only delay, which matters little when everyone watches the same stream (the sound
 * stays in step with the picture, because the browser buffers both). Chromium's
 * `RTCRtpReceiver.jitterBufferTarget`, in milliseconds, at most 4000; other browsers ignore it.
 */
export type PlayoutBufferId = 'standard' | 'short' | 'medium' | 'long';

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
  {
    id: 'long',
    label: 'Long (4 s)',
    description: 'The most patience: for a very unsteady connection. The picture is 4 s late.',
    targetMs: 4000,
  },
];

export function playoutBufferTarget(id: PlayoutBufferId): number | null {
  return PLAYOUT_BUFFER_OPTIONS.find((option) => option.id === id)?.targetMs ?? null;
}

export function isPlayoutBufferId(value: unknown): value is PlayoutBufferId {
  return PLAYOUT_BUFFER_OPTIONS.some((option) => option.id === value);
}
