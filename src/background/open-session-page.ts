import { browser } from 'wxt/browser';

type Browser = typeof browser;

export const SESSION_PAGE_PATH = '/session.html';
const TAB_ID_KEY = 'sessionTabId';

/**
 * Opens the WatchStream page, or focuses it when it is already open, so a
 * second click on the toolbar icon does not start a second session.
 */
export async function openSessionPage(api: Browser = browser): Promise<void> {
  const existing = await findSessionTab(api);
  if (existing?.id !== undefined) {
    await api.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await api.windows.update(existing.windowId, { focused: true });
    }
    return;
  }

  const tab = await api.tabs.create({ url: api.runtime.getURL(SESSION_PAGE_PATH) });
  await api.storage.session.set({ [TAB_ID_KEY]: tab.id });
}

async function findSessionTab(api: Browser) {
  const stored = await api.storage.session.get(TAB_ID_KEY);
  const tabId = stored[TAB_ID_KEY];
  if (typeof tabId !== 'number') return undefined;
  try {
    const tab = await api.tabs.get(tabId);
    return tab.url?.startsWith(api.runtime.getURL(SESSION_PAGE_PATH)) ? tab : undefined;
  } catch {
    return undefined; // The tab was closed.
  }
}
