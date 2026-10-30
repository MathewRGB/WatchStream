import type { LoadStatus } from '@/core/session/host-session';

export interface LoadLine {
  text: string;
  /** How much the host should mind: nothing, or the host cannot keep up and must be told. */
  tone: 'normal' | 'struggling';
}

const viewers = (count: number) => `${count} ${count === 1 ? 'viewer' : 'viewers'}`;

/** The one line on the stage that tells the host what is sent, and says so when it cannot keep up. */
export function describeLoad(load: LoadStatus): LoadLine {
  const { maxHeight, maxFramerate } = load.limits;
  const sending = `${maxHeight}p · ${maxFramerate} fps · ${viewers(load.viewers)}`;

  if (load.struggling) {
    const who = load.cause === 'connection' ? 'your connection' : 'your computer';
    return {
      tone: 'struggling',
      text: `${sending}: ${who} cannot keep up. Some viewers may get the picture late.`,
    };
  }
  return { tone: 'normal', text: sending };
}
