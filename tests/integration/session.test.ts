import { describe, expect, it } from 'vitest';
import type { ChatMessage, Participant } from '../../src/core/protocol/messages';
import { join, startHost, waitFor } from './helpers';

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
    const user2 = await join(host, 'user2');
    const user3 = await join(host, 'user3');

    await waitFor<void>((resolve) => {
      if (user2.participants.length === 3) resolve();
      else user2.events.on('roster', (roster) => roster.length === 3 && resolve());
    });

    const names = ['Host', 'user2', 'user3'];
    expect(host.participants.map((p) => p.name)).toEqual(names);
    expect(user2.participants.map((p) => p.name)).toEqual(names);
    expect(user3.participants.map((p) => p.name)).toEqual(names);
    expect(user2.state).toBe('connected');
  });

  it('relays chat from one viewer to the host and the other viewer', async () => {
    const host = startHost();
    const user2 = await join(host, 'user2');
    const user3 = await join(host, 'user3');
    const received = Promise.all([nextChat(host), nextChat(user2), nextChat(user3)]);

    user2.sendChat('Start in 3, 2, 1');

    const messages = await received;
    for (const message of messages) {
      expect(message).toMatchObject({ senderName: 'user2', text: 'Start in 3, 2, 1' });
    }
    expect(new Set(messages.map((m) => m.id)).size).toBe(1);
  });

  it('removes a viewer from the roster when they leave', async () => {
    const host = startHost();
    const user2 = await join(host, 'user2');
    const user3 = await join(host, 'user3');
    const user3SeesUpdate = waitFor<Participant[]>((resolve) => {
      user3.events.on('roster', (roster) => roster.length === 2 && resolve(roster));
    });

    user2.leave();

    expect((await user3SeesUpdate).map((p) => p.name)).toEqual(['Host', 'user3']);
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
  });

  it('disconnects viewers when the host ends the session', async () => {
    const host = startHost();
    const user2 = await join(host, 'user2');
    const disconnected = waitFor<void>((resolve) => {
      user2.events.on('state', (state) => state === 'disconnected' && resolve());
    });

    host.close();

    await disconnected;
    expect(user2.state).toBe('disconnected');
  });
});
