// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplyStep } from './reply-step';

const PUBLIC = { local: 1, stun: 1, relay: 0, globalIpv6: 0 };
const LOCAL_ONLY = { local: 1, stun: 0, relay: 0, globalIpv6: 0 };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function renderStep(candidates = PUBLIC) {
  render(
    <ReplyStep
      hostName="user1"
      replyCode="WSR1.abc"
      copied
      candidates={candidates}
      hintAfterMs={5_000}
    />,
  );
}

describe('ReplyStep', () => {
  it('asks the host to paste the reply and says it was copied', () => {
    renderStep();

    expect(screen.getByTestId('viewer-state')).toHaveTextContent('Waiting for user1');
    expect(screen.getByTestId('reply-copy-notice')).toHaveTextContent('copied to your clipboard');
  });

  it('suggests a new try only after a while', () => {
    renderStep();
    expect(screen.queryByTestId('still-waiting')).toBeNull();

    act(() => void vi.advanceTimersByTime(5_000));

    expect(screen.getByTestId('still-waiting')).toHaveTextContent('join again');
  });

  it('warns when the reply contains no public address', () => {
    renderStep(LOCAL_ONLY);

    expect(screen.getByTestId('no-public-address')).toBeInTheDocument();
  });

  it('stays quiet when the reply has a public address', () => {
    renderStep(PUBLIC);

    expect(screen.queryByTestId('no-public-address')).toBeNull();
  });
});
