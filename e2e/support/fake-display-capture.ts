import type { Page } from '@playwright/test';

/**
 * The browser's own picker cannot be driven by a test, so `getDisplayMedia`
 * answers with a moving canvas instead. Everything after it (sharing, WebRTC,
 * playing) is the real thing.
 */
export async function installFakeDisplayCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getDisplayMedia = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const context = canvas.getContext('2d')!;
      let frame = 0;
      setInterval(() => {
        context.fillStyle = `hsl(${(frame++ * 9) % 360} 80% 50%)`;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }, 33);
      return canvas.captureStream(30);
    };
  });
}
