import { describe, expect, it } from 'vitest';
import type { ChatMessage, Participant } from '../../src/core/protocol/messages';
import type { ViewerSession } from '../../src/core/session/viewer-session';
import { decodeBase64Url } from '../../src/core/handshake/base64url';
import { decodeInvitation, decodeReply } from '../../src/core/handshake/handshake-code';
import { ViewerSession as Viewer } from '../../src/core/session/viewer-session';
import { connector, join, startHost, waitFor } from './helpers';

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

describe('handshake codes over WebRTC', () => {
  it('are short, made of what the browser really offers, and still connect', async () => {
    const host = startHost();
    const { code } = await host.createInvitation();
    const { session, replyCode } = await Viewer.join(code, { viewerName: 'user2', connector });

    // The compact kind (first byte 0): the browser's description was of the shape it holds.
    expect(decodeBase64Url(code.slice(code.indexOf('.') + 1))[0]).toBe(0);
    expect(decodeBase64Url(replyCode.slice(replyCode.indexOf('.') + 1))[0]).toBe(0);
    // Before this, one of these was 700 to 900 characters long in the same setup.
    expect(code.length).toBeLessThan(260);
    expect(replyCode.length).toBeLessThan(260);
    expect((await decodeInvitation(code)).sdp).toMatch(/^a=fingerprint:sha-256 /m);
    expect((await decodeReply(replyCode)).sdp).toMatch(/^a=setup:active$/m);

    await host.acceptReply(replyCode);
    await waitFor<void>((resolve) => {
      if (session.state === 'connected') resolve();
      else session.events.on('state', (state) => state === 'connected' && resolve());
    });
    session.leave();
  });
});

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

  it('holds twelve viewers, who share one roster and one chat, and refuses a thirteenth', async () => {
    const host = startHost();
    const viewers: ViewerSession[] = [];
    for (let i = 1; i <= 12; i++) viewers.push(await join(host, `viewer${i}`));

    for (const viewer of viewers) {
      await waitFor<void>((resolve) => {
        if (viewer.participants.length === 13) resolve();
        else viewer.events.on('roster', (roster) => roster.length === 13 && resolve());
      });
    }
    expect(host.participants).toHaveLength(13);
    expect(host.openSlots).toBe(0);
    await expect(host.createInvitation()).rejects.toMatchObject({ reason: 'session-full' });

    const received = Promise.all([nextChat(host), ...viewers.map(nextChat)]);
    viewers[6]!.sendChat('Twelve of us');
    for (const message of await received) {
      expect(message).toMatchObject({ senderName: 'viewer7', text: 'Twelve of us' });
    }
  }, 60_000);

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

  it('tells a removed viewer why, before the connection goes, and keeps the others', async () => {
    const host = startHost();
    const gone = await join(host, 'user2');
    const stays = await join(host, 'user3');
    const disconnected = waitFor<void>((resolve) => {
      gone.events.on('state', (state) => state === 'disconnected' && resolve());
    });

    host.removeViewer(host.participants.find((p) => p.name === 'user2')!.id);
    await disconnected;

    // The message came through real data channels before they closed, in both browsers.
    expect(gone.removedByHost).toBe(true);
    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
    expect(stays.state).toBe('connected');
    expect(stays.removedByHost).toBe(false);
  }, 20_000);

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
