/**
 * Sound as it is. Browsers treat captured audio like a microphone by default (echo cancellation,
 * noise suppression, automatic gain), which is made for voices: it muffles music and film sound and
 * makes the level pump. Off here, and stereo, because this is a tab, not a person.
 */
export const UNPROCESSED_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
};

/**
 * Asks the user which tab, window or screen to share. The browser shows its
 * own picker; in Chrome and Brave it offers tab audio, Firefox shares no audio.
 */
export function captureDisplay(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    // The highest rate a host can choose; the links ask for less once they know what is sent.
    video: { frameRate: { ideal: 60 } },
    audio: UNPROCESSED_AUDIO,
  });
}

export type CaptureDisplay = typeof captureDisplay;

/** True when the user closed the picker or refused, which is not worth an error message. */
export function isCaptureCancelled(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}
