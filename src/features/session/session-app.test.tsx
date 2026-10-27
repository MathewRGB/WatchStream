// @vitest-environment happy-dom
import { render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeNetwork } from '@/core/testing/fake-network';
import { fakeCapturedStream } from '@/testing/fake-capture';
import { SessionApp } from './session-app';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

/** One browser tab: its own page with its own container. */
function openPage(
  network: FakeNetwork,
  storage = memoryStorage(),
  capture?: () => Promise<MediaStream>,
) {
  const container = document.body.appendChild(document.createElement('div'));
  render(<SessionApp connector={network} storage={storage} capture={capture} />, { container });
  return within(container);
}

type Page = ReturnType<typeof openPage>;

async function start(page: Page, name: string, as: 'host' | 'join') {
  const input = page.getByTestId('name-input');
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(page.getByTestId(as === 'host' ? 'host-button' : 'join-button'));
}

async function createInvitation(host: Page): Promise<string> {
  const before = host.queryAllByTestId('invitation').length;
  await userEvent.click(host.getByTestId('invite-button'));
  await waitFor(() => expect(host.queryAllByTestId('invitation')).toHaveLength(before + 1));
  return (host.getAllByTestId('invitation-code').at(-1) as HTMLTextAreaElement).value;
}

async function paste(field: HTMLElement, text: string) {
  await userEvent.click(field);
  await userEvent.paste(text);
}

async function joinWith(viewer: Page, invitationCode: string): Promise<string> {
  await paste(viewer.getByTestId('invitation-input'), invitationCode);
  await userEvent.click(viewer.getByTestId('join-session-button'));
  const replyCode = await viewer.findByTestId<HTMLTextAreaElement>('reply-code');
  return replyCode.value;
}

async function pasteReply(host: Page, replyCode: string) {
  const card = within(host.getAllByTestId('invitation').at(-1)!);
  await paste(card.getByTestId('reply-input'), replyCode);
  await userEvent.click(card.getByTestId('connect-button'));
}

async function connect(network: FakeNetwork, host: Page, name: string): Promise<Page> {
  const viewer = openPage(network);
  await start(viewer, name, 'join');
  await pasteReply(host, await joinWith(viewer, await createInvitation(host)));
  await waitFor(() => expect(viewer.getByTestId('viewer-state')).toHaveTextContent('Connected'));
  return viewer;
}

const names = (page: Page) => page.getAllByTestId('participant-name').map((n) => n.textContent);

describe('WatchStream app', () => {
  let network: FakeNetwork;

  beforeEach(() => {
    document.body.replaceChildren();
    network = new FakeNetwork();
  });

  it('asks for a name before starting', async () => {
    const page = openPage(network);

    await userEvent.click(page.getByTestId('host-button'));

    expect(page.getByTestId('start-status')).toHaveTextContent('enter a name');
    expect(page.queryByTestId('host-view')).toBeNull();
  });

  it('starts hosting with Enter in the name field', async () => {
    const page = openPage(network);

    await userEvent.type(page.getByTestId('name-input'), 'user1{Enter}');

    expect(page.getByTestId('host-view')).toBeInTheDocument();
  });

  it('remembers the name for the next time', async () => {
    const storage = memoryStorage();
    await start(openPage(network, storage), 'user1', 'host');

    const again = openPage(network, storage);

    expect(again.getByTestId('name-input')).toHaveValue('user1');
  });

  it('connects a viewer through invitation and reply codes', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');

    const viewer = await connect(network, host, 'user2');

    await waitFor(() => {
      expect(names(host)).toEqual(['user1', 'user2']);
      expect(names(viewer)).toEqual(['user1', 'user2']);
    });
    expect(host.queryAllByTestId('invitation')).toHaveLength(0);
    expect(viewer.queryByTestId('reply-step')).toBeNull();
  });

  it('exchanges chat messages between host and viewer', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');
    const viewer = await connect(network, host, 'user2');

    await userEvent.type(viewer.getByTestId('chat-input'), 'Ready!{Enter}');

    await waitFor(() => {
      expect(host.getByTestId('chat-messages')).toHaveTextContent('Ready!');
      const own = viewer.getByTestId('chat-message');
      expect(own).toHaveTextContent('Ready!');
      expect(within(own).getByTestId('chat-sender')).toHaveTextContent('You');
    });
  });

  it('shows how many places are left and disables inviting when all are taken', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');
    expect(host.getByTestId('open-slots')).toHaveTextContent('Places left: 3');

    await createInvitation(host);
    await createInvitation(host);
    await createInvitation(host);

    expect(host.getByTestId('invite-button')).toBeDisabled();
    expect(host.getByTestId('open-slots')).toHaveTextContent('The session is full.');
  });

  it('frees a place when an invitation is cancelled', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');
    await createInvitation(host);

    await userEvent.click(host.getByTestId('cancel-invitation'));

    expect(host.queryAllByTestId('invitation')).toHaveLength(0);
    expect(host.getByTestId('open-slots')).toHaveTextContent('Places left: 3');
  });

  describe('reply code on the clipboard', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    async function joinOnly(writeText: (text: string) => Promise<void>) {
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const host = openPage(network);
      await start(host, 'user1', 'host');
      const viewer = openPage(network);
      await start(viewer, 'user2', 'join');
      const replyCode = await joinWith(viewer, await createInvitation(host));
      return { viewer, replyCode };
    }

    it('copies the reply code as soon as the viewer has joined and says so', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);

      const { viewer, replyCode } = await joinOnly(writeText);

      expect(writeText).toHaveBeenCalledWith(replyCode);
      expect(viewer.getByTestId('reply-copy-notice')).toHaveTextContent(
        'Reply code copied to your clipboard. Paste it into your chat with user1.',
      );
      expect(viewer.getByTestId('reply-code-copy')).toHaveTextContent('Copied');
    });

    it('asks the viewer to copy by hand when the browser refuses', async () => {
      const { viewer } = await joinOnly(() => Promise.reject(new Error('NotAllowedError')));

      expect(viewer.getByTestId('reply-copy-notice')).toHaveTextContent(
        'Copy the reply code below and send it to user1.',
      );
      expect(viewer.getByTestId('reply-code-copy')).toHaveTextContent('Copy');
      expect(viewer.getByTestId('reply-code-copy')).not.toHaveTextContent('Copied');
    });
  });

  it('explains a damaged invitation code to the viewer', async () => {
    const viewer = openPage(network);
    await start(viewer, 'user2', 'join');

    await paste(viewer.getByTestId('invitation-input'), 'WSI1.broken');
    await userEvent.click(viewer.getByTestId('join-session-button'));

    expect(await viewer.findByTestId('join-status')).toHaveTextContent('incomplete or damaged');
    expect(viewer.getByTestId('join-session-button')).toBeEnabled();
  });

  it('explains to the host when an invitation code is pasted as reply', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');
    const invitationCode = await createInvitation(host);

    await pasteReply(host, invitationCode);

    expect(await host.findByTestId('invitation-status')).toHaveTextContent('Expected a reply code');
    expect(host.getByTestId('connect-button')).toBeEnabled();
  });

  it('tells the viewer when the host ends the session', async () => {
    const host = openPage(network);
    await start(host, 'user1', 'host');
    const viewer = await connect(network, host, 'user2');

    await userEvent.click(host.getByTestId('end-button'));

    await waitFor(() =>
      expect(viewer.getByTestId('viewer-state')).toHaveTextContent('The session has ended.'),
    );
    await userEvent.click(viewer.getByTestId('back-button'));
    expect(viewer.getByTestId('start-view')).toBeInTheDocument();
    expect(host.getByTestId('start-view')).toBeInTheDocument();
  });

  it('returns to the start when a viewer leaves before connecting', async () => {
    const viewer = openPage(network);
    await start(viewer, 'user2', 'join');

    await userEvent.click(viewer.getByTestId('leave-button'));

    expect(viewer.getByTestId('start-view')).toBeInTheDocument();
  });

  it('shows what the host shares to the viewer and ends it again', async () => {
    const { stream, track } = fakeCapturedStream();
    const host = openPage(network, memoryStorage(), async () => stream);
    await start(host, 'user1', 'host');
    const viewer = await connect(network, host, 'user2');
    expect(viewer.getByTestId('stage-empty')).toHaveTextContent('Waiting for user1');

    await userEvent.click(host.getByTestId('share-button'));

    await waitFor(() => {
      expect(viewer.getByTestId('stage-video')).toBeInTheDocument();
      expect(viewer.getByTestId('stage-label')).toHaveTextContent('user1 is sharing');
    });
    expect(host.getByTestId('stage-label')).toHaveTextContent('You are sharing');
    expect(host.queryByTestId('sound-button')).toBeNull();

    await userEvent.click(host.getByTestId('stop-share'));

    await waitFor(() => expect(viewer.getByTestId('stage-empty')).toBeInTheDocument());
    expect(host.getByTestId('share-button')).toBeInTheDocument();
    expect(track.stop).toHaveBeenCalled();
  });
});
