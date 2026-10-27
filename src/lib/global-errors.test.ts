// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearLogHistory, logHistory, setLogSink } from '@/core/log/logger';
import { installGlobalErrorLogging } from './global-errors';

beforeEach(() => {
  clearLogHistory();
  setLogSink(() => {});
});
afterEach(() => setLogSink(null));

describe('installGlobalErrorLogging', () => {
  it('logs uncaught errors and unhandled rejections', () => {
    const remove = installGlobalErrorLogging(window);

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom', lineno: 12 }));
    const rejection = new Event('unhandledrejection');
    Object.assign(rejection, { reason: new RangeError('bad range') });
    window.dispatchEvent(rejection);

    expect(logHistory().map((entry) => entry.message)).toEqual([
      'uncaught error',
      'unhandled promise rejection',
    ]);
    expect(logHistory()[1]?.data).toMatchObject({ error: 'RangeError' });
    remove();
  });

  it('stops logging once removed', () => {
    installGlobalErrorLogging(window)();

    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));

    expect(logHistory()).toHaveLength(0);
  });
});
