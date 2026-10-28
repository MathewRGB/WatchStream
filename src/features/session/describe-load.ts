import { qualityPreset } from '@/core/media/quality';
import type { LoadStatus } from '@/core/session/host-session';

export interface LoadLine {
  text: string;
  /** How much the host should mind: nothing, the quality was lowered, or it cannot be lowered more. */
  tone: 'normal' | 'lowered' | 'overloaded';
}

const viewers = (count: number) => `${count} ${count === 1 ? 'viewer' : 'viewers'}`;

/** The one line on the stage that tells the host what is sent, and why when it is less than chosen. */
export function describeLoad(load: LoadStatus): LoadLine {
  const preset = qualityPreset(load.effective);
  const sending = `${preset.maxHeight}p · ${viewers(load.viewers)}`;
  const connection = load.cause === 'connection';

  if (load.overloaded) {
    const who = connection ? 'your connection' : 'your computer';
    return {
      tone: 'overloaded',
      text: `${sending}: ${who} cannot keep up. Some viewers may get the picture late.`,
    };
  }
  if (load.effective !== load.chosen) {
    const why = connection ? 'your connection cannot keep up' : 'your computer is busy';
    return { tone: 'lowered', text: `Lowered to ${preset.label} (${sending}): ${why}.` };
  }
  return { tone: 'normal', text: sending };
}
