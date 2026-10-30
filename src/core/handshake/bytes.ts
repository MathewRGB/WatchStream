/** Appends bytes, numbers and short pieces of data to a growing buffer. */
export class ByteWriter {
  private readonly chunks: number[] = [];

  u8(value: number): void {
    this.chunks.push(value & 0xff);
  }

  u16(value: number): void {
    this.chunks.push((value >> 8) & 0xff, value & 0xff);
  }

  bytes(value: ArrayLike<number>): void {
    for (let i = 0; i < value.length; i += 1) this.chunks.push(value[i]! & 0xff);
  }

  /** A length of one byte, then the bytes. */
  prefixed(value: Uint8Array): void {
    if (value.length > 255) throw new RangeError('Too long for a one-byte length');
    this.u8(value.length);
    this.bytes(value);
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

/** Reads what `ByteWriter` wrote. Every read past the end throws a `RangeError`. */
export class ByteReader {
  private position = 0;

  constructor(private readonly data: Uint8Array) {}

  u8(): number {
    return this.take(1)[0]!;
  }

  u16(): number {
    const [high, low] = this.take(2) as unknown as [number, number];
    return (high << 8) | low;
  }

  take(length: number): Uint8Array {
    if (this.position + length > this.data.length) throw new RangeError('Unexpected end of data');
    const slice = this.data.subarray(this.position, this.position + length);
    this.position += length;
    return slice;
  }

  /** The bytes of a `ByteWriter.prefixed` piece. */
  prefixed(): Uint8Array {
    return this.take(this.u8());
  }

  /** Whether everything has been read. */
  get done(): boolean {
    return this.position === this.data.length;
  }
}
