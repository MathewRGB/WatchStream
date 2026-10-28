/** Name of the port a tab's sound arrives on. */
export const TAB_SOUND_PORT = 'watchstream-tab-sound';

/** One block of the tab's sound: one array of samples per channel, all the same length. */
export interface PcmMessage {
  kind: 'pcm';
  sampleRate: number;
  channels: Float32Array[];
}

const MIN_SAMPLE_RATE = 8_000;
const MAX_SAMPLE_RATE = 192_000;
/** A block is a few thousand samples; this is a ceiling for what is still plausible. */
const MAX_FRAMES = 32_768;

/** Anything that arrives on the port is checked before it is played. */
export function parsePcmMessage(raw: unknown): PcmMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { kind, sampleRate, channels } = raw as Partial<PcmMessage>;
  if (kind !== 'pcm') return null;
  if (typeof sampleRate !== 'number' || !Number.isFinite(sampleRate)) return null;
  if (sampleRate < MIN_SAMPLE_RATE || sampleRate > MAX_SAMPLE_RATE) return null;
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 2) return null;
  const frames = channels[0]?.length ?? 0;
  if (frames < 1 || frames > MAX_FRAMES) return null;
  if (!channels.every((c) => c instanceof Float32Array && c.length === frames)) return null;
  return { kind, sampleRate, channels };
}
