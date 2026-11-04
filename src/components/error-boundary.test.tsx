// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLogHistory, logHistory, setLogSink } from '@/core/log/logger';
import { ErrorBoundary } from './error-boundary';

function Broken(): never {
  throw new TypeError('the screen is broken');
}

beforeEach(() => {
  clearLogHistory();
  setLogSink(() => {});
  // React prints the caught error to the console; the test does not need it.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('renders its children while nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('all good')).toBeInTheDocument();
    expect(screen.queryByTestId('error-page')).toBeNull();
  });

  it('shows an error page with the reason and the log instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('error-page')).toHaveTextContent('Something went wrong');
    expect(screen.getByTestId('technical-details-text')).toHaveTextContent(
      'Error: TypeError: the screen is broken',
    );
    expect(screen.getByTestId('reload-button')).toBeInTheDocument();
  });

  it('logs the failure', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    expect(logHistory()).toContainEqual(
      expect.objectContaining({
        level: 'error',
        scope: 'ui',
        data: expect.objectContaining({ error: 'TypeError' }),
      }),
    );
  });

  it('tells the page once, so that it can end the sessions that are still running', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('keeps addresses out of the technical details, as it does out of the log', () => {
    function Leaky(): never {
      throw new Error('could not reach 203.0.113.7 or 2001:db8::1');
    }

    render(
      <ErrorBoundary>
        <Leaky />
      </ErrorBoundary>,
    );

    const text = screen.getByTestId('technical-details-text').textContent ?? '';
    expect(text).not.toContain('203.0.113.7');
    expect(text).not.toContain('2001:db8');
    expect(text).toContain('<address>');
  });
});
