/**
 * Asks the user which tab, window or screen to share. The browser shows its
 * own picker; in Chrome and Brave it offers tab audio, Firefox shares no audio.
 */
export function captureDisplay(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
}

export type CaptureDisplay = typeof captureDisplay;

/** True when the user closed the picker or refused, which is not worth an error message. */
export function isCaptureCancelled(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'NotAllowedError' || error.name === 'AbortError')
  );
}
