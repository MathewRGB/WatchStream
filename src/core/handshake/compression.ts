const FORMAT = 'deflate-raw';

export async function compress(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream(FORMAT));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Inflates `bytes` back into text. Rejects when the output would exceed
 * `maxBytes`, so a crafted code cannot exhaust memory.
 */
export async function decompress(bytes: Uint8Array, maxBytes: number): Promise<string> {
  const source = new Blob([bytes as BlobPart]).stream();
  const reader = source.pipeThrough(new DecompressionStream(FORMAT)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError(`Decompressed data exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(concat(chunks, total));
}

function concat(chunks: Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
