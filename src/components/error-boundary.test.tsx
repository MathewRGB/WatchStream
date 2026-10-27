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
});
