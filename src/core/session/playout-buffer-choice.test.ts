import { describe, expect, it } from 'vitest';
import { createHost, joinViewer } from '../testing/session-fixtures';

describe('the viewer smoothing buffer', () => {
  it('is left to the browser at first and reaches the link in milliseconds', async () => {
    const { host, network } = createHost();
    const { viewer } = await joinViewer(host, network, 'one');
    const link = network.answers[0]!;
    expect(viewer.playoutBuffer).toBe('standard');
    expect(link.playoutBufferMs).toBeNull();

    viewer.setPlayoutBuffer('medium');
    expect(viewer.playoutBuffer).toBe('medium');
    expect(link.playoutBufferMs).toBe(2000);

    viewer.setPlayoutBuffer('standard');
    expect(link.playoutBufferMs).toBeNull();
  });
});
