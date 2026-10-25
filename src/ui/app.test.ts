// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeNetwork } from '../core/testing/fake-network';
import { mountApp } from './app';
import { allByTestId, byTestId, click, eventually, type } from './testing/dom-helpers';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

function mount(network: FakeNetwork, storage = memoryStorage()) {
  const root = document.createElement('main');
  document.body.append(root);
  mountApp(root, { connector: network, storage });
  return root;
}

function start(root: HTMLElement, name: string, as: 'host' | 'join') {
  type(byTestId(root, 'name-input'), name);
  click(root, as === 'host' ? 'host-button' : 'join-button');
}

async function createInvitation(host: HTMLElement): Promise<string> {
  const before = allByTestId(host, 'invitation').length;
  click(host, 'invite-button');
  await eventually(() => expect(allByTestId(host, 'invitation')).toHaveLength(before + 1));
  const card = allByTestId(host, 'invitation').at(-1)!;
  return byTestId<HTMLTextAreaElement>(card, 'invitation-code').value;
}

async function joinWith(viewer: HTMLElement, invitationCode: string): Promise<string> {
  type(byTestId(viewer, 'invitation-input'), invitationCode);
  click(viewer, 'join-session-button');
  await eventually(() => byTestId(viewer, 'reply-code'));
  return byTestId<HTMLTextAreaElement>(viewer, 'reply-code').value;
}

function pasteReply(host: HTMLElement, replyCode: string) {
  const card = allByTestId(host, 'invitation').at(-1)!;
  type(byTestId(card, 'reply-input'), replyCode);
  click(card, 'connect-button');
}

const participantNames = (root: HTMLElement) =>
  allByTestId(root, 'participant').map((item) => item.firstChild?.textContent);

async function connect(network: FakeNetwork, host: HTMLElement, name: string) {
  const viewer = mount(network);
  start(viewer, name, 'join');
  pasteReply(host, await joinWith(viewer, await createInvitation(host)));
  await eventually(() =>
    expect(byTestId(viewer, 'viewer-state').textContent).toContain('Connected'),
  );
  return viewer;
}

describe('WatchStream app', () => {
  let network: FakeNetwork;

  beforeEach(() => {
    document.body.replaceChildren();
    network = new FakeNetwork();
  });

  it('asks for a name before starting', () => {
    const root = mount(network);

    click(root, 'host-button');

    expect(byTestId(root, 'start-status').textContent).toContain('enter a name');
    expect(root.querySelector('[data-testid="host-view"]')).toBeNull();
  });

  it('remembers the name for the next time', () => {
    const storage = memoryStorage();
    start(mount(network, storage), 'Mathias', 'host');

    const again = mount(network, storage);

    expect(byTestId<HTMLInputElement>(again, 'name-input').value).toBe('Mathias');
  });

  it('connects a viewer through invitation and reply codes', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');

    const viewer = await connect(network, host, 'Julia');

    await eventually(() => {
      expect(participantNames(host)).toEqual(['Mathias', 'Julia']);
      expect(participantNames(viewer)).toEqual(['Mathias', 'Julia']);
    });
    expect(allByTestId(host, 'invitation')).toHaveLength(0);
    expect(viewer.querySelector('[data-testid="reply-step"]')).toBeNull();
  });

  it('exchanges chat messages between host and viewer', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');
    const viewer = await connect(network, host, 'Julia');

    type(byTestId(viewer, 'chat-input'), 'Ready!');
    click(viewer, 'chat-send');

    await eventually(() => {
      expect(byTestId(host, 'chat-messages').textContent).toContain('Ready!');
      const own = byTestId(viewer, 'chat-messages').querySelector('.own');
      expect(own?.textContent).toMatch(/^You.*Ready!$/);
    });
  });

  it('disables inviting when all places are taken', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');

    await createInvitation(host);
    await createInvitation(host);
    await createInvitation(host);

    expect(byTestId<HTMLButtonElement>(host, 'invite-button').disabled).toBe(true);
    expect(byTestId(host, 'open-slots').textContent).toBe('The session is full.');
  });

  it('frees a place when an invitation is cancelled', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');
    await createInvitation(host);

    click(host, 'cancel-invitation');

    expect(allByTestId(host, 'invitation')).toHaveLength(0);
    expect(byTestId(host, 'open-slots').textContent).toBe('Places left: 3');
  });

  it('explains a damaged invitation code to the viewer', async () => {
    const viewer = mount(network);
    start(viewer, 'Julia', 'join');

    type(byTestId(viewer, 'invitation-input'), 'WSI1.broken');
    click(viewer, 'join-session-button');

    await eventually(() =>
      expect(byTestId(viewer, 'join-status').textContent).toContain('incomplete or damaged'),
    );
  });

  it('explains to the host when an invitation code is pasted as reply', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');
    const invitationCode = await createInvitation(host);

    pasteReply(host, invitationCode);

    await eventually(() =>
      expect(byTestId(host, 'invitation-status').textContent).toContain('Expected a reply code'),
    );
    expect(byTestId<HTMLButtonElement>(host, 'connect-button').disabled).toBe(false);
  });

  it('tells the viewer when the host ends the session', async () => {
    const host = mount(network);
    start(host, 'Mathias', 'host');
    const viewer = await connect(network, host, 'Julia');

    click(host, 'end-button');

    await eventually(() =>
      expect(byTestId(viewer, 'viewer-state').textContent).toBe('The session has ended.'),
    );
    click(viewer, 'back-button');
    expect(byTestId(viewer, 'start-view')).toBeDefined();
    expect(byTestId(host, 'start-view')).toBeDefined();
  });
});
