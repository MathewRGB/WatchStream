import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { openSessionPage, SESSION_PAGE_PATH } from './open-session-page';

const sessionUrl = () => browser.runtime.getURL(SESSION_PAGE_PATH);

async function sessionTabs() {
  const tabs = await browser.tabs.query({});
  return tabs.filter((tab) => tab.url === sessionUrl());
}

describe('openSessionPage', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the session page in a new tab', async () => {
    await openSessionPage();

    expect(await sessionTabs()).toHaveLength(1);
  });

  it('focuses the existing tab instead of opening a second one', async () => {
    await openSessionPage();
    const other = await browser.tabs.create({ url: 'https://example.com', active: true });

    await openSessionPage();

    const tabs = await sessionTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.active).toBe(true);
    expect((await browser.tabs.get(other.id!)).active).toBe(false);
  });

  it('opens a new tab after the previous one was closed', async () => {
    await openSessionPage();
    // Like the real API, `tabs.get` rejects for a closed tab. (The fake's
    // `tabs.remove` cannot be used: it looks up the window by tab id.)
    vi.spyOn(browser.tabs, 'get').mockRejectedValueOnce(new Error('No tab with id'));

    await openSessionPage();

    expect(await sessionTabs()).toHaveLength(2);
  });

  it('opens a new tab when the stored tab now shows another page', async () => {
    await openSessionPage();
    const [first] = await sessionTabs();
    await browser.tabs.update(first!.id!, { url: 'https://example.com' });

    await openSessionPage();

    expect(await sessionTabs()).toHaveLength(1);
  });
});
