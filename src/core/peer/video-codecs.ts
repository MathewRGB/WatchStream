/**
 * The host encodes the picture once per viewer. VP8 is what browsers offer first, and it is
 * encoded in software. H.264 is the codec a graphics chip can encode (on Windows by default), and
 * every browser WatchStream supports decodes it, so it goes first and VP8 stays as the fallback.
 * Only the order changes: nothing is removed, so a viewer without H.264 still connects.
 */
const PREFERRED = ['video/h264', 'video/vp8'];

/** Codecs in the order the sender should offer them: preferred ones first, the rest as they were. */
export function preferVideoCodecs<T extends { mimeType: string }>(codecs: readonly T[]): T[] {
  const rank = (codec: T) => {
    const index = PREFERRED.indexOf(codec.mimeType.toLowerCase());
    return index === -1 ? PREFERRED.length : index;
  };
  // Array.prototype.sort is stable, so codecs of equal rank (H.264 profiles) keep the browser's order.
  return [...codecs].sort((a, b) => rank(a) - rank(b));
}
