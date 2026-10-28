// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHost, flush } from '@/core/testing/session-fixtures';
import { ViewerSession } from '@/core/session/viewer-session';
import { useViewerSession } from './use-viewer-session';

async function joinPending() {
  const { host, network } = createHost({ hostName: 'user1' });
  const { code } = await host.createInvitation();
  const { session, replyCode } = await ViewerSession.join(code, {
    viewerName: 'user2',
    connector: network,
  });
  return { host, session, replyCode };
}

describe('useViewerSession', () => {
  it('starts out waiting for the host', async () => {
    const { session } = await joinPending();

    const { result } = renderHook(() => useViewerSession(session));

    expect(result.current).toEqual({
      state: 'waiting-for-host',
      participants: [],
      participantId: null,
      media: null,
      share: 'idle',
      shareEnd: null,
      ownShare: null,
    });
  });

  it('follows the connection, the roster and the own id', async () => {
    const { host, session, replyCode } = await joinPending();
    const { result } = renderHook(() => useViewerSession(session));

    await act(async () => {
      await host.acceptReply(replyCode);
      await flush();
    });

    expect(result.current.state).toBe('connected');
    expect(result.current.participants.map((p) => p.name)).toEqual(['user1', 'user2']);
    expect(result.current.participantId).toBe(
      result.current.participants.find((p) => p.name === 'user2')?.id,
    );
  });

  it('reports the end of the session', async () => {
    const { host, session, replyCode } = await joinPending();
    const { result } = renderHook(() => useViewerSession(session));
    await act(async () => {
      await host.acceptReply(replyCode);
      await flush();
    });

    await act(async () => {
      host.close();
      await flush();
    });

    expect(result.current.state).toBe('disconnected');
  });
});
