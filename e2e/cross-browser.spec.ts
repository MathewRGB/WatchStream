import { chromium, expect, firefox, test, type Browser } from '@playwright/test';
import { connect, SessionPage } from './support/session-page';
import { installFakeDisplayCapture } from './support/fake-display-capture';
import { serveDirectory } from './support/static-server';

/*
 * Playwright cannot load extensions into Firefox, so this test serves the
 * built Firefox page over http://localhost instead. The page uses no
 * extension APIs in M1, so it behaves the same. It proves that Chromium and
 * Firefox interoperate over WebRTC.
 */

let server: Awaited<ReturnType<typeof serveDirectory>>;
const browsers: Browser[] = [];

test.beforeAll(async () => {
  server = await serveDirectory('.output/firefox-mv3');
});

test.afterAll(async () => {
  await Promise.all(browsers.map((browser) => browser.close()));
  await server.close();
});

async function openIn(launcher: typeof chromium | typeof firefox): Promise<SessionPage> {
  const browser = await launcher.launch();
  browsers.push(browser);
  const page = await browser.newPage();
  await installFakeDisplayCapture(page);
  await page.goto(`${server.url}/session.html`);
  return new SessionPage(page);
}

test('a Chromium host chats with a Firefox and a Chromium viewer', async () => {
  const host = await openIn(chromium);
  const firefoxViewer = await openIn(firefox);
  const chromiumViewer = await openIn(chromium);
  await host.start('Host', 'host');

  await connect(host, firefoxViewer, 'Firefox');
  await connect(host, chromiumViewer, 'Chromium');

  const everyone = ['Host', 'Firefox', 'Chromium'];
  await host.expectParticipants(everyone);
  await firefoxViewer.expectParticipants(everyone);
  await chromiumViewer.expectParticipants(everyone);

  await firefoxViewer.sendChat('Hello from Firefox');
  await host.expectChatMessage('Firefox', 'Hello from Firefox');
  await chromiumViewer.expectChatMessage('Firefox', 'Hello from Firefox');

  await chromiumViewer.sendChat('Hello from Chromium');
  await firefoxViewer.expectChatMessage('Chromium', 'Hello from Chromium');
});

test('a Firefox host chats with a Chromium viewer', async () => {
  const host = await openIn(firefox);
  const viewer = await openIn(chromium);
  await host.start('Host', 'host');

  await connect(host, viewer, 'Viewer');

  await viewer.sendChat('Works the other way round too');
  await host.expectChatMessage('Viewer', 'Works the other way round too');
});

test('a Chromium host shares a picture that a Firefox and a Chromium viewer play', async () => {
  const host = await openIn(chromium);
  const firefoxViewer = await openIn(firefox);
  const chromiumViewer = await openIn(chromium);
  await host.start('Host', 'host');
  await connect(host, firefoxViewer, 'Firefox');
  await connect(host, chromiumViewer, 'Chromium');

  await host.share();

  await host.expectPlaying();
  await firefoxViewer.expectPlaying();
  await chromiumViewer.expectPlaying();
  expect(await firefoxViewer.pageScrolls()).toBe(false);

  await host.stopSharing();
  await expect(firefoxViewer.byTestId('stage-empty')).toBeVisible();
  await expect(chromiumViewer.byTestId('stage-empty')).toBeVisible();

  await host.share();
  await firefoxViewer.expectPlaying();
});

test('a Firefox host shares a picture that a Chromium viewer plays', async () => {
  const host = await openIn(firefox);
  const viewer = await openIn(chromium);
  await host.start('Host', 'host');
  await connect(host, viewer, 'Viewer');

  await host.share();

  await viewer.expectPlaying();
});

test('a viewer who joins during a share sees it', async () => {
  const host = await openIn(chromium);
  const early = await openIn(chromium);
  await host.start('Host', 'host');
  await connect(host, early, 'Early');
  await host.share();

  const late = await openIn(firefox);
  await connect(host, late, 'Late');

  await late.expectPlaying();
});
