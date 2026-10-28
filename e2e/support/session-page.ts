import { expect, type Locator, type Page } from '@playwright/test';

export type SidebarTabId = 'invite' | 'people' | 'chat' | 'settings';

/** Drives the WatchStream page the way a person would. */
export class SessionPage {
  constructor(readonly page: Page) {}

  byTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  /** Switches the sidebar to a tab; inactive tabs are hidden, so a person has to do this too. */
  async openTab(id: SidebarTabId): Promise<void> {
    await this.byTestId(`tab-${id}`).click();
    await expect(this.byTestId(`tab-panel-${id}`)).toBeVisible();
  }

  async start(name: string, as: 'host' | 'join'): Promise<void> {
    await this.byTestId('name-input').fill(name);
    await this.byTestId(as === 'host' ? 'host-button' : 'join-button').click();
  }

  /** Host: creates an invitation and returns its code. */
  async createInvitation(): Promise<string> {
    await this.openTab('invite');
    const count = await this.byTestId('invitation').count();
    await this.byTestId('invite-button').click();
    await expect(this.byTestId('invitation')).toHaveCount(count + 1);
    return this.byTestId('invitation-code').last().inputValue();
  }

  /** Viewer: pastes an invitation and returns the reply code. */
  async acceptInvitation(code: string): Promise<string> {
    await this.byTestId('invitation-input').fill(code);
    await this.byTestId('join-session-button').click();
    return this.byTestId('reply-code').inputValue();
  }

  /** Host: pastes a reply into the newest invitation. */
  async pasteReply(code: string): Promise<void> {
    await this.openTab('invite');
    const card = this.byTestId('invitation').last();
    await card.getByTestId('reply-input').fill(code);
    await card.getByTestId('connect-button').click();
  }

  async expectConnected(): Promise<void> {
    await expect(this.byTestId('viewer-state')).toContainText('Connected');
  }

  async expectParticipants(names: string[]): Promise<void> {
    await this.openTab('people');
    await expect(this.byTestId('participant-name')).toHaveText(names);
  }

  async sendChat(text: string): Promise<void> {
    await this.openTab('chat');
    await this.byTestId('chat-input').fill(text);
    await this.byTestId('chat-send').click();
  }

  async expectChatMessage(sender: string, text: string): Promise<void> {
    await this.openTab('chat');
    const message = this.byTestId('chat-message').filter({ hasText: text });
    await expect(message).toHaveCount(1);
    await expect(message.getByTestId('chat-sender')).toHaveText(sender);
  }

  /** Host: shares what the (fake) picker returns. */
  async share(): Promise<void> {
    await this.byTestId('share-button').click();
    await expect(this.byTestId('stop-share')).toBeVisible();
  }

  /** Viewer: picks the (fake) source and asks the host; waits until the host is asked. */
  async requestShare(): Promise<void> {
    await this.byTestId('share-button').click();
    await expect(this.byTestId('share-waiting')).toBeVisible();
  }

  /** Host: allows the viewer who asked, from the request on the stage. */
  async allowShare(): Promise<void> {
    await this.byTestId('share-allow').click();
  }

  async stopSharing(): Promise<void> {
    await this.byTestId('stop-share').click();
    await expect(this.byTestId('share-button')).toBeVisible();
  }

  /** The stage shows a picture that really plays: it has a size and its clock advances. */
  async expectPlaying(): Promise<void> {
    const video = this.byTestId('stage-video');
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth))
      .toBeGreaterThan(0);
    const before = await video.evaluate((v: HTMLVideoElement) => v.currentTime);
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime))
      .toBeGreaterThan(before);
  }

  /** Audio tracks that the stage video is given: what could be played from it. */
  async stageAudioTrackCount(): Promise<number> {
    return this.byTestId('stage-video').evaluate(
      (v: HTMLVideoElement) => (v.srcObject as MediaStream).getAudioTracks().length,
    );
  }

  /** True when the page itself would show a scroll bar (nothing may scroll but inner areas). */
  async pageScrolls(): Promise<boolean> {
    return this.page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      return root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth;
    });
  }
}

/** Connects a viewer page to a host page through the code exchange. */
export async function connect(host: SessionPage, viewer: SessionPage, viewerName: string) {
  await viewer.start(viewerName, 'join');
  const replyCode = await viewer.acceptInvitation(await host.createInvitation());
  await host.pasteReply(replyCode);
  await viewer.expectConnected();
}
