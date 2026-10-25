import type { MessageLink } from '../../src/core/peer/message-link';

/** Local tests must not depend on a public STUN server. */
export const LOCAL_CONFIG = { iceServers: [], iceGatheringTimeoutMs: 2000 };

export function waitFor<T>(
  subscribe: (resolve: (value: T) => void) => void,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
    subscribe((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

export function nextMessage(link: MessageLink): Promise<string> {
  return waitFor((resolve) => {
    const off = link.events.on('message', (data) => {
      off();
      resolve(data);
    });
  });
}

export function opened(link: MessageLink): Promise<void> {
  if (link.state === 'open') return Promise.resolve();
  return waitFor((resolve) => link.events.on('open', resolve));
}

export function closed(link: MessageLink): Promise<void> {
  if (link.state === 'closed') return Promise.resolve();
  return waitFor((resolve) => link.events.on('close', resolve));
}
