import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { installFakeDisplayCapture } from './support/fake-display-capture';
import { connect, SessionPage } from './support/session-page';

const EXTENSION_PATH = resolve('.output/chrome-mv3');

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

async function openSessionPage(): Promise<SessionPage> {
  const page = await context.newPage();
  await installFakeDisplayCapture(page);
  await page.goto(`chrome-extension://${extensionId}/session.html`);
  return new SessionPage(page);
}

test('the extension ships the WatchStream page', async () => {
  const page = await openSessionPage();

  await expect(page.page).toHaveTitle('WatchStream');
  await expect(page.byTestId('start-view')).toBeVisible();
  await page.page.close();
});

test('host and viewer connect through the extension and chat', async () => {
  const host = await openSessionPage();
  const viewer = await openSessionPage();
  await host.start('user1', 'host');

  await connect(host, viewer, 'user2');

  await host.expectParticipants(['user1', 'user2']);
  await viewer.expectParticipants(['user1', 'user2']);

  await viewer.sendChat('Can you hear me?');
  await host.expectChatMessage('user2', 'Can you hear me?');
  await viewer.expectChatMessage('You', 'Can you hear me?');

  await host.sendChat('Loud and clear');
  await viewer.expectChatMessage('user1', 'Loud and clear');

  await host.byTestId('end-button').click();
  await expect(viewer.byTestId('viewer-state')).toHaveText('The session has ended.');
  await host.page.close();
  await viewer.page.close();
});

test('the reply code is copied automatically and the viewer is told', async () => {
  const host = await openSessionPage();
  const viewer = await openSessionPage();
  await host.start('user1', 'host');
  await viewer.start('user2', 'join');

  const replyCode = await viewer.acceptInvitation(await host.createInvitation());

  await expect(viewer.byTestId('reply-copy-notice')).toContainText(
    'Reply code copied to your clipboard',
  );
  expect(await viewer.page.evaluate(() => navigator.clipboard.readText())).toBe(replyCode);
  await host.page.close();
  await viewer.page.close();
});

test('the copy button puts the invitation code on the clipboard', async () => {
  const host = await openSessionPage();
  await host.start('user1', 'host');
  const code = await host.createInvitation();

  await host.byTestId('invitation-code-copy').click();

  await expect(host.byTestId('invitation-code-copy')).toHaveText('Copied');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await host.page.close();
});

test('the host shares a picture and the viewer plays it, in the real extension', async () => {
  const host = await openSessionPage();
  const viewer = await openSessionPage();
  await host.start('user1', 'host');
  await connect(host, viewer, 'user2');

  await host.share();

  await host.expectPlaying();
  await viewer.expectPlaying();
  await expect(viewer.byTestId('stage-label')).toHaveText('user1 is sharing');
  // The viewer hears the tab; the host already hears it from the tab itself, so the preview
  // must carry no audio at all, or the host would hear an echo.
  await expect.poll(() => viewer.stageAudioTrackCount()).toBe(1);
  expect(await host.stageAudioTrackCount()).toBe(0);
  expect(await viewer.pageScrolls()).toBe(false);
  await host.page.close();
  await viewer.page.close();
});

test('the host chooses the picture quality in the settings tab', async () => {
  const host = await openSessionPage();
  await host.start('user1', 'host');

  await host.openTab('settings');
  await expect(host.byTestId('quality-balanced')).toBeChecked();
  await host.byTestId('quality-saver').check();

  await host.openTab('chat');
  await host.openTab('settings');
  await expect(host.byTestId('quality-saver')).toBeChecked();
  expect(await host.pageScrolls()).toBe(false);
  await host.page.close();
});

test('the viewer sets the volume, it is remembered, and the controls fit a narrow window', async () => {
  const host = await openSessionPage();
  const viewer = await openSessionPage();
  await host.start('user1', 'host');
  await connect(host, viewer, 'user2');
  await host.share();
  await viewer.expectPlaying();
  const video = viewer.byTestId('stage-video');
  const slider = viewer.byTestId('volume-slider');
  expect(await video.evaluate((v: HTMLVideoElement) => v.volume)).toBe(1);

  await slider.fill('0.3');

  expect(await video.evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.3);
  expect(await viewer.page.evaluate(() => localStorage.getItem('watchstream.volume'))).toBe('0.3');

  await viewer.byTestId('sound-button').click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.muted)).toBe(true);
  await viewer.byTestId('sound-button').click();
  expect(await video.evaluate((v: HTMLVideoElement) => v.volume)).toBeCloseTo(0.3);

  // In a narrow window the sidebar covers the stage; hide it and check the controls stay inside.
  await viewer.page.setViewportSize({ width: 480, height: 700 });
  await viewer.byTestId('sidebar-toggle').click();
  const box = await slider.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(480);
  expect(await viewer.pageScrolls()).toBe(false);
  await host.page.close();
  await viewer.page.close();
});
