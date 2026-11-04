import { describe, expect, it, vi } from 'vitest';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';

describe('what the sender gives up on a weak connection', () => {
  it('is steady at first and reaches every viewer link, also a late one', async () => {
    const { host, network } = createHost();
    await joinViewer(host, network, 'one');
    expect(host.weakLink).toBe('steady');
    expect(network.offers[0]!.weakLinkMode).toBe('steady');

    host.setWeakLink('balanced');
    await flush();
    await joinViewer(host, network, 'two');

    expect(network.offers.map((link) => link.weakLinkMode)).toEqual(['balanced', 'balanced']);
  });

  it('tells the listeners once', () => {
    const { host } = createHost();
    const onChange = vi.fn();
    host.events.on('weakLink', onChange);
    host.setWeakLink('smooth');
    host.setWeakLink('smooth');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('smooth');
  });
});

describe('the automatic codec', () => {
  it('becomes VP9 where the browser has no hardware H.264 encoder', async () => {
    const { host, network } = createHost({ detectAutoCodec: async () => 'vp9' });
    await joinViewer(host, network, 'one');
    await flush();

    expect(host.codec).toBe('auto');
    expect(network.offers[0]!.codec).toBe('vp9');
  });

  it('stays automatic where the browser cannot say', async () => {
    const { host, network } = createHost({ detectAutoCodec: async () => null });
    await joinViewer(host, network, 'one');
    await flush();

    expect(network.offers[0]!.codec).toBe('auto');
  });

  it('never overrides a codec the host chose', async () => {
    const { host, network } = createHost({ detectAutoCodec: async () => 'vp9' });
    host.setCodec('av1');
    await joinViewer(host, network, 'one');
    await flush();

    expect(network.offers[0]!.codec).toBe('av1');
  });
});
