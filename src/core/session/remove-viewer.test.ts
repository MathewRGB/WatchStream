import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';
import { MAX_VIEWERS } from './host-session';

afterEach(() => {
  vi.useRealTimers();
});

const sentTypes = (network: { sent: string[] }) =>
  network.sent.map((raw) => (JSON.parse(raw) as { type: string }).type);

describe('removing a viewer', () => {
  it('takes them out of the roster of everybody, and frees the place at once', async () => {
    const { host, network } = createHost();
    const first = await joinViewer(host, network, 'user2');
    const second = await joinViewer(host, network, 'user3');
    const onSlots = vi.fn();
    host.events.on('slots', onSlots);

    host.removeViewer(first.participant.id);

    expect(host.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
    expect(host.openSlots).toBe(MAX_VIEWERS - 1);
    expect(onSlots).toHaveBeenLastCalledWith(MAX_VIEWERS - 1);
    await flush();
    expect(second.viewer.participants.map((p) => p.name)).toEqual(['Host', 'user3']);
  });

  it('tells the viewer they were removed, and the viewer is disconnected at once', async () => {
    const { host, network } = createHost();
    const { viewer, participant } = await joinViewer(host, network, 'user2');
    expect(viewer.removedByHost).toBe(false);

    host.removeViewer(participant.id);
    await flush();

    expect(sentTypes(network)).toContain('removed');
    expect(viewer.removedByHost).toBe(true);
    expect(viewer.state).toBe('disconnected');
  });

  it('does not close the connection in the same breath, so that the message can get out', async () => {
    const { host, network } = createHost();
    const { participant } = await joinViewer(host, network, 'user2');
    vi.useFakeTimers();
    const link = network.offers[0]!;
    // A viewer who does not answer by leaving: only the host's own timing counts here.
    network.answers[0]!.emitter.clear();
    link.close = vi.fn(link.close.bind(link));

    host.removeViewer(participant.id);
    expect(link.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299);
    expect(link.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(link.close).toHaveBeenCalled();
  });

  it('does not hear what the removed viewer says in that moment', async () => {
    const { host, network } = createHost();
    const { viewer, participant } = await joinViewer(host, network, 'user2');
    const onChat = vi.fn();
    host.events.on('chat', onChat);

    host.removeViewer(participant.id);
    viewer.sendChat('Wait, I am still here!');
    await flush();

    expect(onChat).not.toHaveBeenCalled();
  });

  it('does nothing for somebody who is not a viewer, the host included', async () => {
    const { host, network } = createHost();
    await joinViewer(host, network, 'user2');
    const before = host.participants.map((p) => p.name);

    host.removeViewer('nobody');
    host.removeViewer(host.hostId);

    expect(host.participants.map((p) => p.name)).toEqual(before);
    expect(sentTypes(network)).not.toContain('removed');
  });

  it('leaves the others in the session, who go on chatting', async () => {
    const { host, network } = createHost();
    const gone = await joinViewer(host, network, 'user2');
    const stays = await joinViewer(host, network, 'user3');
    const onChat = vi.fn();
    host.events.on('chat', onChat);

    host.removeViewer(gone.participant.id);
    await flush();
    stays.viewer.sendChat('Still here');
    await flush();

    expect(stays.viewer.state).toBe('connected');
    expect(stays.viewer.removedByHost).toBe(false);
    expect(onChat).toHaveBeenCalledWith(expect.objectContaining({ text: 'Still here' }));
  });

  it('gives the place to a new invitation, even when the session was full', async () => {
    const { host, network } = createHost();
    const people = [];
    for (let i = 1; i <= MAX_VIEWERS; i++) people.push(await joinViewer(host, network, `v${i}`));
    await expect(host.createInvitation()).rejects.toMatchObject({ reason: 'session-full' });

    host.removeViewer(people[4]!.participant.id);

    await expect(host.createInvitation()).resolves.toBeDefined();
  });

  it('is not a viewer who left: a viewer who leaves of their own accord is not "removed"', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'user2');

    viewer.leave();
    await flush();

    expect(viewer.removedByHost).toBe(false);
  });

  it('forgets what the load monitor knew about the removed viewer', async () => {
    const { host, network } = createHost();
    const { participant } = await joinViewer(host, network, 'user2');
    const onLoad = vi.fn();
    host.events.on('load', onLoad);

    host.removeViewer(participant.id);

    expect(host.load.viewers).toBe(0);
    expect(host.load.health.has(participant.id)).toBe(false);
    expect(onLoad).toHaveBeenLastCalledWith(expect.objectContaining({ viewers: 0 }));
  });

  it('leaves no timer behind when the session ends right after', async () => {
    const { host, network } = createHost();
    const { participant } = await joinViewer(host, network, 'user2');
    vi.useFakeTimers();

    host.removeViewer(participant.id);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    host.close();

    expect(vi.getTimerCount()).toBe(0);
    expect(network.offers[0]!.state).toBe('closed');
  });
});
