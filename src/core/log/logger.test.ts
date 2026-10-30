import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLogHistory,
  createLogger,
  describeThrown,
  formatLogHistory,
  logHistory,
  scrubMessage,
  setLogSink,
  type LogEntry,
} from './logger';

let entries: LogEntry[];

beforeEach(() => {
  entries = [];
  clearLogHistory();
  setLogSink((entry) => entries.push(entry));
});

afterEach(() => setLogSink(null));

describe('logger', () => {
  it('sends each entry to the sink with level, scope and data', () => {
    createLogger('link').warn('ice failed', { state: 'failed' });

    expect(entries).toEqual([
      expect.objectContaining({
        level: 'warn',
        scope: 'link',
        message: 'ice failed',
        data: { state: 'failed' },
      }),
    ]);
  });

  it('keeps a history for the technical details, capped in size', () => {
    const log = createLogger('x');
    for (let i = 0; i < 350; i += 1) log.debug(`entry ${i}`);

    expect(logHistory()).toHaveLength(300);
    expect(logHistory()[0]?.message).toBe('entry 50');
  });

  it('formats the latest entries as readable lines', () => {
    createLogger('session').error('boom', { code: 7 });

    expect(formatLogHistory()).toMatch(/^\d\d:\d\d:\d\d\.\d{3} ERROR session: boom \{"code":7\}$/);
  });

  it('writes to the browser console by default, with a recognisable prefix', () => {
    setLogSink(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createLogger('link').warn('closed', { state: 'failed' });

    expect(warn).toHaveBeenCalledWith('[WatchStream] link: closed', { state: 'failed' });
    warn.mockRestore();
  });

  it('describes a thrown error by name and shortened message, and anything else by type', () => {
    expect(describeThrown(new TypeError('x'.repeat(500)))).toEqual({
      error: 'TypeError',
      message: 'x'.repeat(200),
    });
    expect(describeThrown('text')).toEqual({ error: 'string' });
  });
});

describe('scrubMessage', () => {
  it('cuts what a browser quotes from a session description', () => {
    expect(
      scrubMessage(
        'Failed to parse SessionDescription. a=candidate:1 1 udp 1 203.0.113.7 9 typ x Invalid value',
      ),
    ).toBe('Failed to parse SessionDescription.');
  });

  it('takes out addresses that are named on their own', () => {
    expect(scrubMessage('No route to 203.0.113.7 or 2001:db8::1 now')).toBe(
      'No route to <address> or <address> now',
    );
  });

  it('leaves an ordinary error text alone, and keeps it short', () => {
    expect(scrubMessage('Cannot set remote answer in state stable')).toBe(
      'Cannot set remote answer in state stable',
    );
    expect(scrubMessage('x'.repeat(500))).toHaveLength(200);
  });
});
