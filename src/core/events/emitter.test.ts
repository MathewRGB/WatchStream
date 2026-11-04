import { describe, expect, it, vi } from 'vitest';
import { clearLogHistory, logHistory, setLogSink } from '../log/logger';
import { Emitter } from './emitter';

interface Events {
  message: string;
  close: undefined;
}

describe('Emitter', () => {
  it('delivers payloads to every listener of the event', () => {
    const emitter = new Emitter<Events>();
    const first = vi.fn();
    const second = vi.fn();
    emitter.on('message', first);
    emitter.on('message', second);

    emitter.emit('message', 'hi');

    expect(first).toHaveBeenCalledWith('hi');
    expect(second).toHaveBeenCalledWith('hi');
  });

  it('does not deliver other events', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    emitter.on('close', listener);

    emitter.emit('message', 'hi');

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribing', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    const off = emitter.on('message', listener);

    off();
    emitter.emit('message', 'hi');

    expect(listener).not.toHaveBeenCalled();
  });

  it('lets a listener unsubscribe while the event is being delivered', () => {
    const emitter = new Emitter<Events>();
    const later = vi.fn();
    const off = emitter.on('message', () => off());
    emitter.on('message', later);

    emitter.emit('message', 'hi');
    emitter.emit('message', 'again');

    expect(later).toHaveBeenCalledTimes(2);
  });

  it('removes all listeners on clear', () => {
    const emitter = new Emitter<Events>();
    const listener = vi.fn();
    emitter.on('message', listener);

    emitter.clear();
    emitter.emit('message', 'hi');

    expect(listener).not.toHaveBeenCalled();
  });

  it('logs a listener that throws and still delivers to the others', () => {
    setLogSink(() => {});
    clearLogHistory();
    try {
      const emitter = new Emitter<Events>();
      const later = vi.fn();
      emitter.on('message', () => {
        throw new TypeError('broken listener');
      });
      emitter.on('message', later);

      expect(() => emitter.emit('message', 'hi')).not.toThrow();

      expect(later).toHaveBeenCalledWith('hi');
      expect(logHistory()).toContainEqual(
        expect.objectContaining({
          level: 'error',
          message: 'a listener failed',
          data: expect.objectContaining({ event: 'message', error: 'TypeError' }),
        }),
      );
    } finally {
      setLogSink(null);
    }
  });
});
