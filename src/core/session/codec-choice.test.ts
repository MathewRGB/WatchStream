import { describe, expect, it, vi } from 'vitest';
import { createHost, flush, joinViewer } from '../testing/session-fixtures';

describe('the codec the host chooses', () => {
  it('is automatic at first and reaches every viewer link', async () => {
    const { host, network } = createHost();
    await joinViewer(host, network, 'one');
    await joinViewer(host, network, 'two');
    expect(host.codec).toBe('auto');

    host.setCodec('vp9');
    await flush();

    expect(host.codec).toBe('vp9');
    expect(network.offers.map((link) => link.codec)).toEqual(['vp9', 'vp9']);
  });

  it('reaches a viewer who joins later', async () => {
    const { host, network } = createHost();
    host.setCodec('h264');

    await joinViewer(host, network, 'late');

    expect(network.offers[0]!.codec).toBe('h264');
  });

  it('tells the listeners once, and nothing for the codec it already has', () => {
    const { host } = createHost();
    const onCodec = vi.fn();
    host.events.on('codec', onCodec);

    host.setCodec('vp8');
    host.setCodec('vp8');

    expect(onCodec).toHaveBeenCalledTimes(1);
    expect(onCodec).toHaveBeenCalledWith('vp8');
  });

  it('does not drop a viewer whose link cannot take it', async () => {
    const { host, network } = createHost();
    await joinViewer(host, network, 'one');
    network.offers[0]!.setVideoCodec = async () => {
      throw new Error('refused');
    };

    host.setCodec('av1');
    await flush();

    expect(host.participants).toHaveLength(2);
  });
});
