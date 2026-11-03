/**
 * The host encodes the picture once per viewer, so the codec decides how much that costs and how
 * much each copy needs. The host may choose it; every choice only changes the ORDER of what is
 * offered, and nothing is removed, so a viewer whose browser lacks the chosen codec still connects
 * with the next one.
 *
 * - `auto`: H.264 where a graphics chip encodes it (see `detectAutoCodec`), else VP9, which holds
 *   a picture together on far less data when the processor has to do the work; then H.264, VP8.
 * - `h264`: the same, for a host that wants to say so.
 * - `vp9`: about a third less data for the same picture, at a higher cost for the processor.
 * - `vp8`: software-encoded everywhere, the fallback of last resort.
 * - `av1`: the least data, the most work; only worthwhile with an encoder in hardware.
 */
export type CodecId = 'auto' | 'h264' | 'vp9' | 'vp8' | 'av1';

export const DEFAULT_CODEC: CodecId = 'auto';

export interface CodecOption {
  id: CodecId;
  label: string;
  description: string;
}

export const CODEC_OPTIONS: readonly CodecOption[] = [
  {
    id: 'auto',
    label: 'Automatic',
    description:
      'H.264 where your graphics chip encodes it, otherwise VP9, which keeps the picture clean on a weak connection. Right for most hosts.',
  },
  {
    id: 'h264',
    label: 'H.264',
    description: 'Light on the processor where the graphics chip encodes it (Windows).',
  },
  {
    id: 'vp9',
    label: 'VP9',
    description: 'About a third less data for the same picture, but more work for the processor.',
  },
  {
    id: 'vp8',
    label: 'VP8',
    description: 'Works everywhere, always encoded by the processor.',
  },
  {
    id: 'av1',
    label: 'AV1',
    description: 'The least data, the most work. Only for a host with a hardware encoder.',
  },
];

/** What follows the chosen codec when a viewer cannot use it: the automatic order. */
const AUTOMATIC_ORDER = ['video/h264', 'video/vp8'];

function offeredOrder(preference: CodecId): string[] {
  return preference === 'auto' ? AUTOMATIC_ORDER : [`video/${preference}`, ...AUTOMATIC_ORDER];
}

/**
 * What `auto` comes to on this computer: H.264 where the browser reports a power-efficient
 * (hardware) encoder for it, else VP9 when the browser can encode that, else H.264. A software
 * H.264 encoder needs about a third more data than VP9 for the same picture and holds a rate
 * badly, which shows on a long route. `null` where the browser cannot say (Firefox, old versions).
 */
export async function detectAutoCodec(): Promise<'h264' | 'vp9' | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaCapabilities?.encodingInfo) return null;
  if (/firefox/i.test(navigator.userAgent)) return null;
  const probe = async (contentType: string) => {
    try {
      return await navigator.mediaCapabilities.encodingInfo({
        type: 'webrtc',
        video: { contentType, width: 1280, height: 720, bitrate: 3_000_000, framerate: 30 },
      });
    } catch {
      return null;
    }
  };
  const h264 = await probe('video/H264;profile-level-id=42e01f');
  if (h264?.supported && h264.powerEfficient) return 'h264';
  const vp9 = await probe('video/VP9');
  if (vp9?.supported) return 'vp9';
  return h264 === null ? null : 'h264';
}

/**
 * Codecs in the order the sender should offer them: the chosen one first, then H.264 and VP8, the
 * rest as the browser had them. Codecs of one kind (H.264 profiles) keep the browser's order.
 */
export function preferVideoCodecs<T extends { mimeType: string }>(
  codecs: readonly T[],
  preference: CodecId = DEFAULT_CODEC,
): T[] {
  const order = offeredOrder(preference);
  const rank = (codec: T) => {
    const index = order.indexOf(codec.mimeType.toLowerCase());
    return index === -1 ? order.length : index;
  };
  // Array.prototype.sort is stable, so codecs of equal rank keep the browser's order.
  return [...codecs].sort((a, b) => rank(a) - rank(b));
}

/**
 * The options this browser can really offer: `auto` always, and each codec it lists. Empty where
 * the browser takes no preference (Firefox, which keeps its own order), so the host is not shown a
 * choice that does nothing.
 */
export function availableCodecOptions(
  codecs: readonly { mimeType: string }[] | undefined,
): CodecOption[] {
  if (!codecs || codecs.length === 0) return [];
  const kinds = new Set(codecs.map((codec) => codec.mimeType.toLowerCase()));
  return CODEC_OPTIONS.filter((option) => option.id === 'auto' || kinds.has(`video/${option.id}`));
}
