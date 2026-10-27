// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createHost, flush, joinViewer } from '@/core/testing/session-fixtures';
import { useHostSession } from './use-host-session';

describe('useHostSession', () => {
  it('starts with the host alone and all places free', () => {
    const { host } = createHost({ hostName: 'user1' });

    const { result } = renderHook(() => useHostSession(host));

    expect(result.current.participants.map((p) => p.name)).toEqual(['user1']);
    expect(result.current.openSlots).toBe(3);
  });

  it('updates the free places when an invitation is created and cancelled', async () => {
    const { host } = createHost();
    const { result } = renderHook(() => useHostSession(host));

    let inviteId = '';
    await act(async () => {
      inviteId = (await host.createInvitation()).inviteId;
    });
    expect(result.current.openSlots).toBe(2);

    act(() => host.cancelInvitation(inviteId));
    expect(result.current.openSlots).toBe(3);
  });

  it('updates participants and places when a viewer joins and leaves', async () => {
    const { host, network } = createHost();
    const { result } = renderHook(() => useHostSession(host));

    let leave = () => {};
    await act(async () => {
      const { viewer } = await joinViewer(host, network, 'user2');
      leave = () => viewer.leave();
    });
    expect(result.current.participants.map((p) => p.name)).toEqual(['Host', 'user2']);
    expect(result.current.openSlots).toBe(2);

    await act(async () => {
      leave();
      await flush();
    });
    expect(result.current.participants.map((p) => p.name)).toEqual(['Host']);
    expect(result.current.openSlots).toBe(3);
  });

  it('stops listening after unmounting', () => {
    const { host } = createHost();
    const { unmount } = renderHook(() => useHostSession(host));

    unmount();

    // A listener left behind would try to update an unmounted component.
    expect(() => host.cancelInvitation('x')).not.toThrow();
  });
});
