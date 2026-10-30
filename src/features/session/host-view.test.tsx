// @vitest-environment happy-dom
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FakeLink } from '@/core/testing/fake-network';
import { createHost, joinViewer } from '@/core/testing/session-fixtures';
import { fakeCapturedStream } from '@/testing/fake-capture';
import { HostView } from './host-view';

afterEach(() => {
  vi.useRealTimers();
});

/** A link counting frames: `encodes` of every `produced` that the source gives. */
function count(link: FakeLink, round: number, produced: number, encodes: number) {
  link.statsReading = {
    at: round * 2000,
    framesEncoded: round * 2 * encodes,
    sourceFrames: round * 2 * produced,
    bytesSent: round * 750_000,
    availableBps: null,
    lossFraction: null,
    rttMs: 5,
  };
}

async function hostViewWithViewers(count: number) {
  const { host, network } = createHost({ hostName: 'user1' });
  for (let i = 1; i <= count; i++) await joinViewer(host, network, `viewer${i}`);
  render(
    <HostView
      session={host}
      hostName="user1"
      capture={async () => fakeCapturedStream().stream}
      onEnd={() => {}}
    />,
  );
  return { host, network };
}

describe('HostView and the load', () => {
  it('shows no line before something is shared, and none without viewers', async () => {
    const { host } = await hostViewWithViewers(2);
    expect(screen.queryByTestId('load-line')).toBeNull();

    act(() => host.stopSharing());
    expect(screen.queryByTestId('load-line')).toBeNull();
  });

  it('says what is sent and to how many once the host shares', async () => {
    const { host } = await hostViewWithViewers(3);

    act(() => host.startSharing(fakeCapturedStream().stream));

    expect(screen.getByTestId('load-line')).toHaveTextContent('720p · 30 fps · 3 viewers');
    expect(screen.getByTestId('load-line')).toHaveAttribute('data-tone', 'normal');
  });

  it('says so when the host could not keep up, and marks the slow', async () => {
    const { host, network } = await hostViewWithViewers(4);
    vi.useFakeTimers();
    act(() => host.startSharing(fakeCapturedStream().stream));
    const links = network.offers.slice(0, 4);

    for (let round = 1; round <= 20; round++) {
      // Every link encodes 9 of the 30 frames the source gives.
      links.forEach((link) => count(link, round, 30, 9));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }

    const line = screen.getByTestId('load-line');
    expect(line).toHaveAttribute('data-tone', 'struggling');
    expect(line).toHaveTextContent('720p · 30 fps · 4 viewers: your computer cannot keep up.');
    // Everyone fell behind, so all four are marked; the People tab shows them.
    expect(
      within(screen.getByTestId('tab-panel-people')).getAllByTestId('participant-slow'),
    ).toHaveLength(4);
  });

  it('shows the line again as normal once the host chooses a quality anew', async () => {
    const { host, network } = await hostViewWithViewers(4);
    vi.useFakeTimers();
    act(() => host.startSharing(fakeCapturedStream().stream));
    const links = network.offers.slice(0, 4);
    for (let round = 1; round <= 20; round++) {
      links.forEach((link) => count(link, round, 30, 9));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
    }
    expect(screen.getByTestId('load-line')).not.toHaveAttribute('data-tone', 'normal');

    act(() => host.setQuality('sharp'));

    expect(screen.getByTestId('load-line')).toHaveTextContent('1080p · 30 fps · 4 viewers');
    expect(screen.getByTestId('load-line')).toHaveAttribute('data-tone', 'normal');
  });
});
