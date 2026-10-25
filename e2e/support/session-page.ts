import { expect, type Locator, type Page } from '@playwright/test';

/** Drives the WatchStream page the way a person would. */
export class SessionPage {
  constructor(readonly page: Page) {}

  byTestId(testId: string): Locator {
    return this.page.getByTestId(testId);
  }

  async start(name: string, as: 'host' | 'join'): Promise<void> {
    await this.byTestId('name-input').fill(name);
    await this.byTestId(as === 'host' ? 'host-button' : 'join-button').click();
  }

  /** Host: creates an invitation and returns its code. */
  async createInvitation(): Promise<string> {
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
    const card = this.byTestId('invitation').last();
    await card.getByTestId('reply-input').fill(code);
    await card.getByTestId('connect-button').click();
  }

  async expectConnected(): Promise<void> {
    await expect(this.byTestId('viewer-state')).toContainText('Connected');
  }

  async expectParticipants(names: string[]): Promise<void> {
    await expect(this.byTestId('participant').locator('span:first-child')).toHaveText(names);
  }

  async sendChat(text: string): Promise<void> {
    await this.byTestId('chat-input').fill(text);
    await this.byTestId('chat-send').click();
  }

  async expectChatMessage(sender: string, text: string): Promise<void> {
    const message = this.byTestId('chat-message').filter({ hasText: text });
    await expect(message).toHaveCount(1);
    await expect(message.locator('.sender')).toHaveText(sender);
  }
}

/** Connects a viewer page to a host page through the code exchange. */
export async function connect(host: SessionPage, viewer: SessionPage, viewerName: string) {
  await viewer.start(viewerName, 'join');
  const replyCode = await viewer.acceptInvitation(await host.createInvitation());
  await host.pasteReply(replyCode);
  await viewer.expectConnected();
}
