import { browser } from 'wxt/browser';
import { parsePcmMessage, TAB_SOUND_PORT } from '@/core/tab-sound/relay';
import { TabSoundSink } from '@/core/tab-sound/sink';

/** How long the injected script gets to deliver its first block of sound. */
const FIRST_SOUND_TIMEOUT_MS = 4000;
// WXT types the paths of the target it prepared last, and this script exists in Firefox only.
const CONTENT_SCRIPT = '/content-scripts/tab-sound.js' as '/background.js';

export interface TabChoice {
  id: number;
  /** The window the tab is in. */
  windowId?: number;
  title: string;
  /** `https://example.org`, what the host is asked to allow. */
  origin: string;
  audible: boolean;
}

export type TabSoundFailure = 'permission' | 'no-sound';

export class TabSoundError extends Error {
  constructor(readonly failure: TabSoundFailure) {
    super(failure);
    this.name = 'TabSoundError';
  }
}

export interface TabSoundHandle {
  sink: TabSoundSink;
  title: string;
  stop: () => void;
}

/**
 * Firefox shares no tab sound through `getDisplayMedia`, so it gets this way around; Chrome and
 * Brave do not need it.
 */
export function tabSoundSupported(): boolean {
  // The page also runs as a plain web page (the cross-browser tests serve it so), where there is no
  // `browser` at all.
  const api = (globalThis as { browser?: typeof browser; chrome?: typeof browser }).browser;
  return import.meta.env.FIREFOX === true && typeof api?.scripting?.executeScript === 'function';
}

/** Asked for when the host opens the list: reading tab titles needs the `tabs` permission. */
export function allowTabList(): Promise<boolean> {
  return browser.permissions.request({ permissions: ['tabs'] });
}

/** The pages that can have a video, those that make sound first. */
export async function listTabs(): Promise<TabChoice[]> {
  const tabs = await browser.tabs.query({});
  const choices: TabChoice[] = [];
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url) continue;
    const url = new URL(tab.url);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    choices.push({
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || url.hostname,
      origin: url.origin,
      audible: tab.audible === true,
    });
  }
  return choices.sort((a, b) => Number(b.audible) - Number(a.audible));
}

const AUTO_PERMISSIONS = { permissions: ['tabs' as const], origins: ['<all_urls>'] };

/** Whether the host already allowed detecting the tab on its own. */
export async function autoDetectAllowed(): Promise<boolean> {
  return Promise.resolve(browser.permissions.contains(AUTO_PERMISSIONS));
}

/**
 * Asks once for what detecting the tab needs: the tab list and access to the sites. It has to be
 * the first thing after a click. Resolves at once when the host allowed it before.
 */
export function requestAutoDetect(): Promise<boolean> {
  return browser.permissions.request(AUTO_PERMISSIONS);
}

/**
 * The tab whose sound is meant, among the tabs that play sound now (the WatchStream page itself is
 * not one of them). One tab is the answer. Several: the one in the host's own window if that is
 * only one; otherwise nobody can say, and the host chooses from the list.
 */
export function pickAudibleTab(tabs: TabChoice[], ownWindowId?: number): TabChoice | null {
  const audible = tabs.filter((tab) => tab.audible);
  if (audible.length === 1) return audible[0] ?? null;
  const here = audible.filter((tab) => tab.windowId === ownWindowId);
  return ownWindowId !== undefined && here.length === 1 ? (here[0] ?? null) : null;
}

/** The tab that plays sound now, or `null` when there is none or it is not clear which. */
export async function detectAudibleTab(): Promise<TabChoice | null> {
  const own = await browser.tabs.getCurrent();
  const tabs = (await listTabs()).filter((tab) => tab.id !== own?.id);
  return pickAudibleTab(tabs, own?.windowId);
}

/**
 * Takes the sound of the video in a tab. The host is asked for access to that site (this has to
 * be the first thing that happens after the click), the script is injected, and the first frame
 * that sends sound wins. `onEnded` runs when the sound stops without `stop` being called: the tab
 * was closed or went to another page. `context` is an audio context made during the click, which
 * the browser lets start; one made later can stay suspended.
 */
export async function startTabSound(
  tab: TabChoice,
  onEnded: () => void,
  context?: AudioContext,
): Promise<TabSoundHandle> {
  const granted = await browser.permissions.request({ origins: [`${tab.origin}/*`] });
  if (!granted) throw new TabSoundError('permission');

  const sink = new TabSoundSink(context);
  let adopted: ReturnType<typeof browser.runtime.connect> | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    browser.runtime.onConnect.removeListener(onConnect);
    adopted?.disconnect();
    sink.close();
  };

  let firstSound!: () => void;
  const heard = new Promise<void>((resolve) => (firstSound = resolve));

  function onConnect(port: ReturnType<typeof browser.runtime.connect>) {
    if (port.name !== TAB_SOUND_PORT || port.sender?.tab?.id !== tab.id) return;
    port.onMessage.addListener((raw) => {
      const message = parsePcmMessage(raw);
      if (!message) return;
      if (adopted && adopted !== port) {
        port.disconnect(); // A second frame with a video: the first one stays.
        return;
      }
      if (!adopted) {
        adopted = port;
        firstSound();
      }
      sink.push(message);
    });
    port.onDisconnect.addListener(() => {
      if (port !== adopted || stopped) return;
      stop();
      onEnded();
    });
  }
  browser.runtime.onConnect.addListener(onConnect);

  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: [CONTENT_SCRIPT],
    });
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new TabSoundError('no-sound')), FIRST_SOUND_TIMEOUT_MS),
    );
    await Promise.race([heard, timeout]);
  } catch (error) {
    stop();
    throw error instanceof TabSoundError ? error : new TabSoundError('no-sound');
  }
  return { sink, title: tab.title, stop };
}
