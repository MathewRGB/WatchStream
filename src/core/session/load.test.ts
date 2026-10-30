import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualityPreset } from '../media/quality';
import type { FakeLink, FakeNetwork } from '../testing/fake-network';
import { createHost, joinViewer } from '../testing/session-fixtures';
import type { HostSession, LoadStatus } from './host-session';
import { ViewerSession } from './viewer-session';

afterEach(() => {
  vi.useRealTimers();
});

interface Rates {
  enc?: number;
  src?: number;
  loss?: number | null;
}

/** Makes the host-side links count frames the way a browser would, two seconds at a time. */
class Counters {
  private at = 0;
  private totals = new Map<FakeLink, { enc: number; src: number; bytes: number }>();

  /** Sets the next reading of every link; `rates(index)` says how it fares. */
  set(links: FakeLink[], rates: (index: number) => Rates = () => ({})) {
    this.at += 2000;
    links.forEach((link, index) => {
      const rate = rates(index);
      const total = this.totals.get(link) ?? { enc: 0, src: 0, bytes: 0 };
      total.enc += (rate.enc ?? 30) * 2;
      total.src += (rate.src ?? 30) * 2;
      total.bytes += (3_000_000 / 8) * 2;
      this.totals.set(link, total);
      link.statsReading = {
        at: this.at,
        framesEncoded: total.enc,
        sourceFrames: total.src,
        bytesSent: total.bytes,
        availableBps: null,
        lossFraction: rate.loss ?? null,
        rttMs: 5,
      };
    });
  }
}

/** Viewers are joined first, on real timers; then the clock is faked for the monitor. */
async function hostWithViewers(count: number) {
  const { host, network } = createHost();
  for (let i = 1; i <= count; i++) await joinViewer(host, network, `viewer${i}`);
  vi.useFakeTimers();
  return { host, network, links: () => network.offers.slice(0, host.participants.length - 1) };
}

/** A viewer who joins while the clock is fake, which `joinViewer` cannot do. */
async function joinOnFakeClock(host: HostSession, network: FakeNetwork, name: string) {
  const { code } = await host.createInvitation();
  const { replyCode } = await ViewerSession.join(code, { viewerName: name, connector: network });
  await host.acceptReply(replyCode);
  await vi.advanceTimersByTimeAsync(0);
}

/** `seconds` of reading rounds; `rates` says how each link fares in every round. */
async function rounds(
  seconds: number,
  counters: Counters,
  links: FakeLink[],
  rates?: (index: number) => Rates,
) {
  for (let t = 0; t < seconds; t += 2) {
    counters.set(links, rates);
    await vi.advanceTimersByTimeAsync(2000);
  }
}

const shareNow = (host: HostSession) => host.startSharing(new MediaStream());
const bad = () => ({ enc: 6 });

describe('HostSession and the load monitor', () => {
  it('keeps sending the chosen quality while the host keeps up', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);

    await rounds(120, counters, links());

    expect(host.quality).toBe('balanced');
    for (const link of links()) expect(link.limits).toEqual(qualityPreset('balanced'));
    expect(host.load).toMatchObject({
      chosen: 'balanced',
      struggling: false,
      cause: null,
      viewers: 4,
    });
  });

  it('tells the host when it cannot keep up, and keeps sending the chosen quality', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    const statuses: LoadStatus[] = [];
    host.events.on('load', (status) => statuses.push(status));
    shareNow(host);

    await rounds(40, counters, links(), bad);

    expect(host.quality).toBe('balanced');
    for (const link of links()) expect(link.limits).toEqual(qualityPreset('balanced'));
    expect(host.load).toMatchObject({ chosen: 'balanced', struggling: true, cause: 'computer' });
    expect(statuses.at(-1)).toMatchObject({ struggling: true, cause: 'computer' });
  });

  it('never changes the quality by itself, however long the host struggles', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    const chosen: string[] = [];
    host.events.on('load', (status) => chosen.push(status.chosen));
    shareNow(host);

    await rounds(120, counters, links(), bad);

    expect(host.load.struggling).toBe(true);
    expect(new Set(chosen)).toEqual(new Set(['balanced']));
    for (const link of links()) expect(link.limits).toEqual(qualityPreset('balanced'));
  });

  it('tells the host what each viewer really gets, and starts over when the quality changes', async () => {
    const { host, links } = await hostWithViewers(2);
    const counters = new Counters();
    const seen: (number | null)[] = [];
    host.events.on('load', (status) => seen.push(status.sendingBps));
    shareNow(host);
    expect(host.load.sendingBps).toBeNull();

    await rounds(8, counters, links());

    // Every link sends 3 Mbit/s in the test counters.
    expect(host.load.sendingBps).toBe(3_000_000);
    expect(seen.at(-1)).toBe(3_000_000);

    host.setQuality('saver');
    expect(host.load.sendingBps).toBeNull();
    expect(host.load.limits).toEqual(qualityPreset('saver'));
  });

  it('sends the chosen quality to a viewer who joins later', async () => {
    const { host, network, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);
    await rounds(40, counters, links(), bad);
    expect(host.load.struggling).toBe(true);

    await joinOnFakeClock(host, network, 'late');

    const late = network.offers.at(-1)!;
    expect(late.limits).toEqual(qualityPreset('balanced'));
  });

  it('marks one slow viewer and leaves the quality of the others alone', async () => {
    const { host, links } = await hostWithViewers(5);
    const counters = new Counters();
    shareNow(host);

    await rounds(120, counters, links(), (index) => (index === 2 ? { enc: 4 } : {}));

    expect(host.load.struggling).toBe(false);
    const slow = [...host.load.health].filter(([, health]) => health === 'slow');
    expect(slow).toHaveLength(1);
    expect(slow[0]![0]).toBe(host.participants[3]!.id);
  });

  it('counts lost packets on every link as the connection, not the computer', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);

    await rounds(40, counters, links(), () => ({ loss: 0.15 }));

    expect(host.load).toMatchObject({ struggling: true, cause: 'connection' });
  });

  it('stops telling the host it struggles once it has kept up again', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);
    await rounds(30, counters, links(), bad);
    expect(host.load.struggling).toBe(true);

    await rounds(10, counters, links());

    expect(host.load).toMatchObject({ struggling: false, cause: null });
    for (const link of links()) expect(link.limits).toEqual(qualityPreset('balanced'));
  });

  it('starts over when the host chooses another quality', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);
    await rounds(40, counters, links(), bad);
    expect(host.load.struggling).toBe(true);

    host.setQuality('sharp');

    expect(host.quality).toBe('sharp');
    for (const link of links()) expect(link.limits).toEqual(qualityPreset('sharp'));
    expect(host.load).toMatchObject({ chosen: 'sharp', struggling: false, cause: null });
  });

  it('reads no statistics before something is shared, and none after it stops', async () => {
    const { host, links } = await hostWithViewers(3);
    const reads = vi.fn();
    for (const link of links()) {
      const original = link.stats.bind(link);
      link.stats = async () => {
        reads();
        return original();
      };
    }

    await vi.advanceTimersByTimeAsync(20_000);
    expect(reads).not.toHaveBeenCalled();

    shareNow(host);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(reads).toHaveBeenCalled();
    const count = reads.mock.calls.length;

    host.stopSharing();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(reads.mock.calls.length).toBe(count);
  });

  it('stops telling the host it struggles when sharing stops', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    shareNow(host);
    await rounds(40, counters, links(), bad);
    expect(host.load.struggling).toBe(true);

    host.stopSharing();

    expect(host.load).toMatchObject({ struggling: false, cause: null });
  });

  it('stops reading when the session ends', async () => {
    const { host, links } = await hostWithViewers(2);
    shareNow(host);
    const reads = vi.fn();
    for (const link of links()) {
      link.stats = async () => {
        reads();
        return null;
      };
    }

    host.close();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(reads).not.toHaveBeenCalled();
  });

  it('copes with a link that cannot be read, and judges the others', async () => {
    const { host, links } = await hostWithViewers(4);
    const counters = new Counters();
    links()[0]!.stats = () => Promise.reject(new Error('closing'));
    shareNow(host);

    await rounds(60, counters, links(), bad);

    expect(host.load.struggling).toBe(true);
  });

  it('forgets a viewer who leaves', async () => {
    const { host, links } = await hostWithViewers(3);
    const counters = new Counters();
    shareNow(host);
    await rounds(60, counters, links(), (index) => (index === 1 ? { enc: 3 } : {}));
    const leaving = host.participants[2]!.id;
    expect(host.load.health.get(leaving)).toBe('slow');

    links()[1]!.close();
    await vi.advanceTimersByTimeAsync(0);

    expect(host.load.health.has(leaving)).toBe(false);
    expect(host.load.viewers).toBe(2);
  });

  it('says nothing new while nothing changes', async () => {
    const { host, links } = await hostWithViewers(3);
    const counters = new Counters();
    shareNow(host);
    await rounds(20, counters, links());
    const onLoad = vi.fn();
    host.events.on('load', onLoad);

    await rounds(120, counters, links());

    expect(onLoad).not.toHaveBeenCalled();
  });

  it('tells the listeners when a viewer joins or leaves', async () => {
    const { host, network } = createHost();
    const onLoad = vi.fn((status: LoadStatus) => status.viewers);
    host.events.on('load', onLoad);

    await joinViewer(host, network, 'user2');

    expect(onLoad).toHaveBeenLastCalledWith(expect.objectContaining({ viewers: 1 }));
  });

  it('reads as often as it is told to', async () => {
    const { host, network } = createHost({ monitorIntervalMs: 500 });
    await joinViewer(host, network, 'user2');
    vi.useFakeTimers();
    const reads = vi.fn();
    network.offers[0]!.stats = async () => {
      reads();
      return null;
    };
    shareNow(host);

    await vi.advanceTimersByTimeAsync(2_000);

    expect(reads).toHaveBeenCalledTimes(4);
  });
});
