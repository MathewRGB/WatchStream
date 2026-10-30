import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { installFakeDisplayCapture } from './support/fake-display-capture';
import { connect, SessionPage } from './support/session-page';

const EXTENSION_PATH = resolve('.output/chrome-mv3');
const VIEWERS = 5;
/** What the host is told it sends: the real bitrate of the browser's encoder, so no fixed number. */
const LOAD_LINE = /^720p · 30 fps · (up to|[\d.]+ of) 3\.5 Mbit\/s · 5 viewers$/;
const LOAD_LINE_MEASURED = /^720p · 30 fps · [\d.]+ of 3\.5 Mbit\/s · 5 viewers$/;

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
  await expect(host.byTestId('load-line')).toHaveText(LOAD_LINE);
  // And the load monitor, reading the real statistics of five real links for longer than its
  // grace period and three readings, finds nothing to report and nobody slow.
  await host.page.waitForTimeout(15_000);
  await expect(host.byTestId('load-line')).toHaveText(LOAD_LINE_MEASURED);
  await expect(host.byTestId('load-line')).toHaveAttribute('data-tone', 'normal');
  await host.openTab('people');
  await expect(host.byTestId('participant-slow')).toHaveCount(0);

  for (const page of [host, ...viewers]) await page.page.close();
});

test('a viewer shares in the real extension: the host decides, four others watch', async () => {
  const host = await openSessionPage();
  const sharer = await openSessionPage();
  await host.start('user1', 'host');
  await connect(host, sharer, 'sharer');
  const watchers: SessionPage[] = [];
  for (let i = 1; i <= 4; i++) {
    const watcher = await openSessionPage();
    await connect(host, watcher, `watcher${i}`);
    watchers.push(watcher);
  }

  await sharer.requestShare();
  await expect(host.byTestId('share-request-banner')).toContainText('sharer wants to share');
  await host.allowShare();

  await host.expectPlaying();
  for (const watcher of watchers) await watcher.expectPlaying();
  await host.openTab('people');
  await expect(host.byTestId('participant-sharing')).toHaveCount(1);
  // The host sends the same load line for a forwarded picture as for its own.
  await expect(host.byTestId('load-line')).toHaveText(LOAD_LINE);

  // While the stage is taken, the others are not offered the picker.
  await expect(watchers[0]!.byTestId('share-button')).toBeDisabled();

  await host.byTestId('stop-viewer-share').click();
  await expect(sharer.byTestId('share-notice')).toHaveText('user1 ended your share.');
  for (const watcher of watchers) await expect(watcher.byTestId('stage-empty')).toBeVisible();

  for (const page of [host, sharer, ...watchers]) await page.page.close();
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

test('the host invites several viewers at once, and each code takes one person in', async () => {
  const host = await openSessionPage();
  await host.start('user1', 'host');
  await host.openTab('invite');

  await host.byTestId('invite-count').fill('3');
  await host.byTestId('invite-count').press('Tab');
  await expect(host.byTestId('invite-button')).toHaveText('Invite 3 viewers');
  await host.byTestId('invite-button').click();

  await expect(host.byTestId('invitation')).toHaveCount(3);
  await expect(host.byTestId('invitation-label')).toHaveText([
    'Invitation 1',
    'Invitation 2',
    'Invitation 3',
  ]);
  await expect(host.byTestId('open-slots')).toHaveText('Places left: 9');

  const viewers: SessionPage[] = [];
  for (let i = 1; i <= 3; i++) {
    const viewer = await openSessionPage();
    await viewer.start(`viewer${i}`, 'join');
    // The first card still open is the next one in line.
    const card = host.byTestId('invitation').first();
    const replyCode = await viewer.acceptInvitation(
      await card.getByTestId('invitation-code').inputValue(),
    );
    await card.getByTestId('reply-input').fill(replyCode);
    await card.getByTestId('connect-button').click();
    await viewer.expectConnected();
    viewers.push(viewer);
  }

  await host.expectParticipants(['user1', 'viewer1', 'viewer2', 'viewer3']);
  await host.openTab('invite');
  await expect(host.byTestId('invitation')).toHaveCount(0);
  await expect(host.byTestId('open-slots')).toHaveText('Places left: 9');

  for (const page of [host, ...viewers]) await page.page.close();
});
