// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearLogHistory, createLogger, setLogSink } from '@/core/log/logger';
import { TechnicalDetails } from './technical-details';

beforeEach(() => {
  clearLogHistory();
  setLogSink(() => {});
});
afterEach(() => setLogSink(null));

describe('TechnicalDetails', () => {
  it('shows the connection state, the browser and the latest log lines', () => {
    createLogger('link.host').warn('connection state', { state: 'failed' });

    render(<TechnicalDetails details="Connection: failed, ICE: failed" />);

    const text = screen.getByTestId('technical-details-text');
    expect(text).toHaveTextContent('Connection: failed, ICE: failed');
    expect(text).toHaveTextContent('Browser:');
    expect(text).toHaveTextContent('WARN link.host: connection state {"state":"failed"}');
  });

  it('copies exactly what it shows', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<TechnicalDetails details="Connection: failed" />);

    await userEvent.click(screen.getByTestId('technical-details-copy'));

    expect(writeText).toHaveBeenCalledWith(
      screen.getByTestId('technical-details-text').textContent,
    );
    expect(screen.getByTestId('technical-details-copy')).toHaveTextContent('Copied');
  });

  it('asks to copy by hand where the browser refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    });
    render(<TechnicalDetails />);

    await userEvent.click(screen.getByTestId('technical-details-copy'));

    expect(screen.getByTestId('technical-details-copy')).toHaveTextContent('Copy by hand');
  });
});
