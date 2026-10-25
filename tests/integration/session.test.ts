import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage, Participant } from '../../src/core/protocol/messages';
import { createPeerConnector } from '../../src/core/peer/peer-link';
import { HostSession } from '../../src/core/session/host-session';
import { ViewerSession } from '../../src/core/session/viewer-session';
import { LOCAL_CONFIG, waitFor } from './helpers';

const connector = createPeerConnector(LOCAL_CONFIG);
const cleanups: (() => void)[] = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function startHost(): HostSession {
  const host = new HostSession({ hostName: 'Host', connector });
  cleanups.push(() => host.close());
  return host;
}

async function join(host: HostSession, viewerName: string): Promise<ViewerSession> {
  const { code } = await host.createInvitation();
  const { session, replyCode } = await ViewerSession.join(code, { viewerName, connector });
  cleanups.push(() => session.leave());
  const rosterReceived = waitFor<Participant[]>((resolve) => {
    const off = session.events.on('roster', (roster) => {
      if (roster.some((p) => p.name === viewerName)) {
        off();
        resolve(roster);
      }
    });
  });
  await host.acceptReply(replyCode);
  await rosterReceived;
  return session;
}

interface ChatSource {
  events: { on(event: 'chat', listener: (message: ChatMessage) => void): () => void };
}

function nextChat(session: ChatSource) {
  return waitFor<ChatMessage>((resolve) => {
    const off = session.events.on('chat', (message) => {
      off();
      resolve(message);
    });
  });
}

describe('host and viewer sessions over WebRTC', () => {
  it('connects two viewers and shares one roster', async () => {
    const host = startHost();
    const julia = await join(host, 'Julia');
    const tom = await join(host, 'Tom');

    await waitFor<void>((resolve) => {
      if (julia.participants.length === 3) resolve();
      else julia.events.on('roster', (roster) => roster.length === 3 && resolve());
    });

    const names = ['Host', 'Julia', 'Tom'];
    expect(host.participants.map((p) => p.name)).toEqual(names);
    expect(julia.participants.map((p) => p.name)).toEqual(names);
    expect(tom.participants.map((p) => p.name)).toEqual(names);
    expect(julia.state).toBe('connected');
  });

  it('relays chat from one viewer to the host and the other viewer', async () => {
    const host = startHost();
    const julia = await join(host, 'Julia');
    const tom = await join(host, 'Tom');
    const received = Promise.all([nextChat(host), nextChat(julia), nextChat(tom)]);

    julia.sendChat('Start in 3, 2, 1');

    const messages = await received;
    for (const message of messages) {
      expect(message).toMatchObject({ senderName: 'Julia', text: 'Start in 3, 2, 1' });
    }
    expect(new Set(messages.map((m) => m.id)).size).toBe(1);
  });

  it('removes a viewer from the roster when they leave', async () => {
    const host = startHost();
    const julia = await join(host, 'Julia');
    const tom = await join(host, 'Tom');
    const tomSeesUpdate = waitFor<Participant[]>((resolve) => {
      tom.events.on('roster', (roster) => roster.length === 2 && resolve(roster));
    });

    julia.leave();

    expect((await tomSeesUpdate).map((p) => p.name)).toEqual(['Host', 'Tom']);
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'Tom']);
  });

  it('disconnects viewers when the host ends the session', async () => {
    const host = startHost();
    const julia = await join(host, 'Julia');
    const disconnected = waitFor<void>((resolve) => {
      julia.events.on('state', (state) => state === 'disconnected' && resolve());
    });

    host.close();

    await disconnected;
    expect(julia.state).toBe('disconnected');
  });
});
