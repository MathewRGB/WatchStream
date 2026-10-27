import { chromium, expect, test, type BrowserContext } from '@playwright/test';
import { resolve } from 'node:path';
import { connect, SessionPage } from './support/session-page';

const EXTENSION_PATH = resolve('.output/chrome-mv3');
const SIZES = [
  { name: 'laptop', width: 1280, height: 720 },
  { name: 'small window', width: 900, height: 560 },
  { name: 'narrow', width: 480, height: 700 },
];

let context: BrowserContext;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context.close();
});

async function openSessionPage(size: { width: number; height: number }): Promise<SessionPage> {
  const page = await context.newPage();
  await page.setViewportSize(size);
  await page.goto(`chrome-extension://${extensionId}/session.html`);
  return new SessionPage(page);
}

test('control: the scroll check does notice a page that is too tall or too wide', async () => {
  const page = await openSessionPage(SIZES[0]!);

  expect(await page.pageScrolls()).toBe(false);
  await page.page.evaluate(() => {
    const tall = document.createElement('div');
    tall.style.height = '5000px';
    document.body.append(tall);
  });
  expect(await page.pageScrolls()).toBe(true);

  await page.page.evaluate(() => {
    document.body.lastElementChild?.remove();
    const wide = document.createElement('div');
    wide.style.width = '5000px';
    wide.style.height = '1px';
    document.body.append(wide);
  });
  expect(await page.pageScrolls()).toBe(true);
  await page.page.close();
});

for (const size of SIZES) {
  test.describe(`${size.name} (${size.width}x${size.height})`, () => {
    test('no screen needs the page to scroll', async () => {
      const host = await openSessionPage(size);
      expect(await host.pageScrolls()).toBe(false); // start screen

      await host.start('user1', 'host');
      expect(await host.pageScrolls()).toBe(false); // empty host window

      for (let i = 0; i < 3; i++) await host.createInvitation();
      expect(await host.pageScrolls()).toBe(false); // three open invitations

      const viewer = await openSessionPage(size);
      await viewer.start('user2', 'join');
      expect(await viewer.pageScrolls()).toBe(false); // join form
      const reply = await viewer.acceptInvitation(
        await host.byTestId('invitation-code').first().inputValue(),
      );
      expect(await viewer.pageScrolls()).toBe(false); // reply step

      await host.byTestId('reply-input').first().fill(reply);
      await host.byTestId('connect-button').first().click();
      await viewer.expectConnected();
      expect(await viewer.pageScrolls()).toBe(false); // connected viewer

      for (let i = 0; i < 40; i++) {
        await host.sendChat(`message number ${i} with some words so it takes room`);
      }
      expect(await host.pageScrolls()).toBe(false); // long chat
      await viewer.openTab('chat');
      expect(await viewer.pageScrolls()).toBe(false);

      await host.page.close();
      await viewer.page.close();
    });
  });
}

test('a long chat scrolls inside its list and keeps the input in view', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  await host.openTab('chat');

  for (let i = 0; i < 40; i++) {
    await host.byTestId('chat-input').fill(`line ${i}`);
    await host.byTestId('chat-send').click();
  }

  const list = host.byTestId('chat-messages');
  const metrics = await list.evaluate((el) => ({
    scrollable: el.scrollHeight > el.clientHeight,
    atBottom: Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 4,
  }));
  expect(metrics).toEqual({ scrollable: true, atBottom: true });
  await expect(host.byTestId('chat-input')).toBeInViewport();
  await host.page.close();
});

test('only the active tab is shown and typed text survives a tab switch', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  await host.openTab('invite');
  await host.byTestId('invite-button').click();
  await host.byTestId('reply-input').fill('WSR1.half-typed');

  await host.openTab('chat');
  await expect(host.byTestId('tab-panel-invite')).toBeHidden();
  await expect(host.byTestId('chat-input')).toBeVisible();

  await host.openTab('invite');
  await expect(host.byTestId('reply-input')).toHaveValue('WSR1.half-typed');
  await host.page.close();
});

test('the sidebar can be hidden and shown; the stage takes the free space', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  const stageWidth = async () => (await host.byTestId('stage').boundingBox())!.width;
  const narrow = await stageWidth();

  await host.byTestId('sidebar-toggle').click();
  await expect(host.byTestId('sidebar')).toBeHidden();
  expect(await stageWidth()).toBeGreaterThan(narrow + 300);

  await host.byTestId('sidebar-toggle').click();
  await expect(host.byTestId('sidebar')).toBeVisible();
  expect(await stageWidth()).toBeCloseTo(narrow, 0);
  await host.page.close();
});

test('stage and sidebar end above the window edge with a thin border', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');

  for (const id of ['stage-panel', 'sidebar']) {
    const panel = host.byTestId(id);
    const box = (await panel.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(SIZES[0]!.height - 4);
    const border = await panel.evaluate((el) => getComputedStyle(el).borderBottomWidth);
    expect(border).toBe('1px');
  }
  await host.page.close();
});

test('in a narrow window the open sidebar takes the whole width', async () => {
  const host = await openSessionPage(SIZES[2]!);
  await host.start('user1', 'host');

  await expect(host.byTestId('stage')).toBeHidden();
  const box = (await host.byTestId('sidebar').boundingBox())!;
  // The window width minus the margin on both sides.
  expect(Math.round(box.width)).toBe(SIZES[2]!.width - 16);

  await host.byTestId('sidebar-toggle').click();
  await expect(host.byTestId('stage')).toBeVisible();
  await host.page.close();
});

test('the workspace goes into full screen and back', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  const fullscreenId = () =>
    host.page.evaluate(() => document.fullscreenElement?.getAttribute('data-testid') ?? null);

  await host.byTestId('fullscreen-button').click();
  await expect.poll(fullscreenId).toBe('workspace');
  await expect(host.byTestId('fullscreen-button')).toHaveAccessibleName('Exit full screen');
  // The stage fills the screen; the sidebar waits outside the visible area at the right edge.
  const screen = host.page.viewportSize()!;
  const stage = (await host.byTestId('stage').boundingBox())!;
  expect(stage.width).toBe(screen.width);
  expect(stage.height).toBe(screen.height);
  // It slides out of the way in a moment, so wait for it to be gone.
  await expect
    .poll(async () => (await host.byTestId('sidebar').boundingBox())!.x)
    .toBeGreaterThanOrEqual(screen.width);

  await host.byTestId('fullscreen-button').click();
  await expect.poll(fullscreenId).toBeNull();
  await expect(host.byTestId('fullscreen-button')).toHaveAccessibleName('Full screen');
  await host.page.close();
});

test('the connected viewer sees the stage and the sidebar side by side', async () => {
  const host = await openSessionPage(SIZES[0]!);
  const viewer = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  await connect(host, viewer, 'user2');

  await expect(viewer.byTestId('stage')).toBeVisible();
  await expect(viewer.byTestId('sidebar')).toBeVisible();
  const stage = (await viewer.byTestId('stage').boundingBox())!;
  const sidebar = (await viewer.byTestId('sidebar').boundingBox())!;
  expect(stage.x + stage.width).toBeLessThanOrEqual(sidebar.x + 1);
  expect(stage.width).toBeGreaterThan(sidebar.width);
  await host.page.close();
  await viewer.page.close();
});

test('in full screen the sidebar slides in at the right edge and stays while typing', async () => {
  const host = await openSessionPage(SIZES[0]!);
  const viewer = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  await connect(host, viewer, 'user2');
  const screen = viewer.page.viewportSize()!;
  const sidebarLeft = async () => (await viewer.byTestId('sidebar').boundingBox())!.x;
  const isShown = async () => (await sidebarLeft()) < screen.width - 300;

  await viewer.byTestId('fullscreen-button').click();
  await expect
    .poll(() => viewer.page.evaluate(() => document.fullscreenElement !== null))
    .toBe(true);
  expect(await isShown()).toBe(false);

  // Touching the edge brings it in, over the picture: the stage keeps its size.
  const stageBefore = (await viewer.byTestId('stage').boundingBox())!;
  await viewer.page.mouse.move(screen.width - 3, screen.height / 2);
  await expect.poll(isShown).toBe(true);
  expect((await viewer.byTestId('stage').boundingBox())!.width).toBe(stageBefore.width);

  // A half-typed message keeps it open, however far the pointer goes.
  await viewer.byTestId('chat-input').fill('typing at the edge');
  await viewer.page.mouse.move(screen.width / 2, screen.height / 2);
  await viewer.page.waitForTimeout(1_000);
  expect(await isShown()).toBe(true);

  // A click on the picture closes it; the text is still there when it comes back.
  await viewer.page.mouse.click(screen.width / 2, screen.height / 2);
  await expect.poll(isShown).toBe(false);
  await viewer.page.mouse.move(screen.width - 3, screen.height / 2);
  await expect.poll(isShown).toBe(true);
  await expect(viewer.byTestId('chat-input')).toHaveValue('typing at the edge');

  // Without focus in it, it goes when the pointer leaves.
  await viewer.page.mouse.click(screen.width / 2, screen.height / 2);
  await viewer.page.mouse.move(screen.width - 3, screen.height / 2);
  await expect.poll(isShown).toBe(true);
  await viewer.page.mouse.move(screen.width / 2, screen.height / 2);
  await expect.poll(isShown).toBe(false);

  await host.page.close();
  await viewer.page.close();
});

test('in full screen the sidebar also opens with the handle and the S key', async () => {
  const host = await openSessionPage(SIZES[0]!);
  const viewer = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  await connect(host, viewer, 'user2');
  const screen = viewer.page.viewportSize()!;
  const isShown = async () =>
    (await viewer.byTestId('sidebar').boundingBox())!.x < screen.width - 300;

  await viewer.byTestId('fullscreen-button').click();
  await expect(viewer.byTestId('sidebar-handle')).toBeVisible();
  await viewer.page.mouse.move(screen.width / 2, screen.height / 2);

  // The handle: a click brings the sidebar in, and the handle makes room for it.
  await viewer.byTestId('sidebar-handle').click();
  await expect.poll(isShown).toBe(true);
  await expect(viewer.byTestId('sidebar-handle')).toHaveCount(0);

  // The key opens and closes it with no pointer near, and it stays open meanwhile.
  await viewer.page.mouse.move(screen.width / 2, screen.height / 2);
  await expect.poll(isShown).toBe(false);
  await viewer.page.keyboard.press('s');
  await expect.poll(isShown).toBe(true);
  await viewer.page.waitForTimeout(1_000);
  expect(await isShown()).toBe(true);
  await viewer.page.keyboard.press('s');
  await expect.poll(isShown).toBe(false);

  await host.page.close();
  await viewer.page.close();
});

test('in full screen the controls and the pointer go when idle and come back on a move', async () => {
  const host = await openSessionPage(SIZES[0]!);
  await host.start('user1', 'host');
  const style = (testId: string, property: 'opacity' | 'cursor' | 'pointerEvents') =>
    host.byTestId(testId).evaluate((el, name) => {
      if (name !== 'opacity') return getComputedStyle(el)[name];
      // What is seen is the opacity of the element times that of everything around it.
      let seen = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        seen *= Number(getComputedStyle(node).opacity);
      }
      return String(Math.round(seen * 100) / 100);
    }, property);
  const screen = host.page.viewportSize()!;

  await host.byTestId('fullscreen-button').click();
  await expect.poll(() => host.page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
  expect(await style('fullscreen-button', 'opacity')).toBe('0.8');
  expect(await style('share-button', 'opacity')).toBe('1');
  await expect(host.byTestId('sidebar-handle')).toBeVisible();

  // A few seconds with the pointer still: only the picture is left, and no pointer over it.
  await expect.poll(() => style('fullscreen-button', 'opacity'), { timeout: 10_000 }).toBe('0');
  expect(await style('share-button', 'opacity')).toBe('0');
  expect(await style('sidebar-handle', 'opacity')).toBe('0');
  expect(await style('fullscreen-button', 'pointerEvents')).toBe('none');
  await expect(host.byTestId('workspace')).toHaveAttribute('data-idle', 'true');
  expect(await style('workspace', 'cursor')).toBe('none');
  // Also where a control would show its own pointer.
  expect(await style('share-button', 'cursor')).toBe('none');

  // The first move brings everything back.
  await host.page.mouse.move(screen.width / 2, screen.height / 2);
  await expect.poll(() => style('fullscreen-button', 'opacity')).toBe('0.8');
  expect(await style('share-button', 'opacity')).toBe('1');
  expect(await style('sidebar-handle', 'opacity')).toBe('0.6');
  await expect(host.byTestId('workspace')).toHaveAttribute('data-idle', 'false');
  expect(await style('workspace', 'cursor')).not.toBe('none');

  // And it goes again when nothing happens.
  await expect.poll(() => style('fullscreen-button', 'opacity'), { timeout: 10_000 }).toBe('0');

  // Outside full screen nothing ever fades.
  await host.page.mouse.move(screen.width / 2 + 5, screen.height / 2);
  await host.byTestId('fullscreen-button').click();
  await expect.poll(() => host.page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await host.page.waitForTimeout(4_000);
  await expect(host.byTestId('workspace')).toHaveAttribute('data-idle', 'false');
  expect(await style('fullscreen-button', 'opacity')).toBe('0.8');
  await host.page.close();
});
