import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { installFakeDisplayCapture } from './support/fake-display-capture';
import { connect, SessionPage } from './support/session-page';

const EXTENSION_PATH = resolve('.output/chrome-mv3');
const VIEWERS = 5;

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

test('a host with five viewers: one roster, one chat and one picture for everyone', async () => {
  const host = await openSessionPage();
  await host.start('user1', 'host');
  const viewers: SessionPage[] = [];
  for (let i = 1; i <= VIEWERS; i++) {
    const viewer = await openSessionPage();
    await connect(host, viewer, `viewer${i}`);
    viewers.push(viewer);
  }

  const names = ['user1', ...viewers.map((_, i) => `viewer${i + 1}`)];
  await host.expectParticipants(names);
  for (const viewer of viewers) await viewer.expectParticipants(names);
  await host.openTab('invite');
  await expect(host.byTestId('open-slots')).toHaveText(`Places left: ${12 - VIEWERS}`);

  await viewers[2]!.sendChat('Five of us');
  await host.expectChatMessage('viewer3', 'Five of us');
  for (const [i, viewer] of viewers.entries()) {
    await viewer.expectChatMessage(i === 2 ? 'You' : 'viewer3', 'Five of us');
  }

  await host.share();
  await host.expectPlaying();
  for (const viewer of viewers) await viewer.expectPlaying();

  // The host is told what it sends and to how many.
  await expect(host.byTestId('load-line')).toHaveText('720p · 5 viewers');
  // And the load monitor, reading the real statistics of five real links for longer than its
  // grace period and three readings, finds nothing to lower and nobody slow.
  await host.page.waitForTimeout(15_000);
  await expect(host.byTestId('load-line')).toHaveText('720p · 5 viewers');
  await expect(host.byTestId('load-line')).toHaveAttribute('data-tone', 'normal');
  await host.openTab('people');
  await expect(host.byTestId('participant-slow')).toHaveCount(0);

  for (const page of [host, ...viewers]) await page.page.close();
});

test('the host removes a viewer, who is told why, while the other keeps watching', async () => {
  const host = await openSessionPage();
  const gone = await openSessionPage();
  const stays = await openSessionPage();
  await host.start('user1', 'host');
  await connect(host, gone, 'viewer1');
  await connect(host, stays, 'viewer2');
  await host.expectParticipants(['user1', 'viewer1', 'viewer2']);

  const row = host.byTestId('participant').filter({ hasText: 'viewer1' });
  await row.getByTestId('participant-remove').click();
  await row.getByTestId('participant-remove-confirm').click();

  await expect(gone.byTestId('viewer-state')).toHaveText('The host removed you from the session.');
  await expect(gone.byTestId('removed-note')).toContainText('join again with a new invitation');
  await host.expectParticipants(['user1', 'viewer2']);
  await stays.expectParticipants(['user1', 'viewer2']);
  await expect(stays.byTestId('viewer-state')).toContainText('Connected');
  await stays.sendChat('Still here');
  await host.expectChatMessage('viewer2', 'Still here');
  await host.openTab('invite');
  await expect(host.byTestId('open-slots')).toHaveText('Places left: 11');

  for (const page of [host, gone, stays]) await page.page.close();
});
