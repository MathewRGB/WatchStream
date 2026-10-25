// Generates the extension icons (public/icon/<size>.png) without extra
// dependencies: a rounded square with a play triangle, anti-aliased by
// supersampling. Run with `node scripts/generate-icons.mjs`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 96, 128];
const SAMPLES = 4;
const BACKGROUND = [0x6c, 0x8c, 0xff];
const FOREGROUND = [0xff, 0xff, 0xff];

function insideRoundedSquare(x, y) {
  const radius = 0.22;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insidePlayTriangle(x, y) {
  const [ax, ay, bx, by, cx, cy] = [0.38, 0.27, 0.38, 0.73, 0.76, 0.5];
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let coverage = 0;
      let foreground = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (!insideRoundedSquare(x, y)) continue;
          coverage++;
          if (insidePlayTriangle(x, y)) foreground++;
        }
      }
      const offset = (py * size + px) * 4;
      const mix = coverage ? foreground / coverage : 0;
      for (let c = 0; c < 3; c++) {
        pixels[offset + c] = Math.round(BACKGROUND[c] * (1 - mix) + FOREGROUND[c] * mix);
      }
      pixels[offset + 3] = Math.round((coverage / SAMPLES ** 2) * 255);
    }
  }
  return encodePng(size, pixels);
}

function encodePng(size, pixels) {
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const outDir = new URL('../public/icon/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`${size}.png`, outDir), render(size));
}
console.log(`Wrote ${SIZES.length} icons to public/icon/`);
