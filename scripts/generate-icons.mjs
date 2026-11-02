// Generates the extension icons (public/icon/<size>.png) without extra
// dependencies: a rounded square with a screen showing a host and its viewers, anti-aliased by
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

function insideDisc(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function insideSegment(x, y, [ax, ay], [bx, by], width) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return insideDisc(x, y, ax + t * dx, ay + t * dy, width / 2);
}

function insideRoundedBox(x, y, [x0, y0, x1, y1], radius) {
  const cx = Math.min(Math.max(x, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(y, y0 + radius), y1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

// A screen on a stand with a host and its viewers on the stage. Small sizes get a thicker frame
// and a single dot: three tiny nodes would only blur at 16 or 32 px.
function insideScreen(x, y, detailed) {
  const stroke = detailed ? 0.06 : 0.085;
  const outer = [0.13, 0.2, 0.87, 0.68];
  const inner = [outer[0] + stroke, outer[1] + stroke, outer[2] - stroke, outer[3] - stroke];
  const frame = insideRoundedBox(x, y, outer, 0.07) && !insideRoundedBox(x, y, inner, 0.03);
  const stand =
    insideSegment(x, y, [0.5, 0.68], [0.5, 0.79], stroke) ||
    insideSegment(x, y, [0.35, 0.79], [0.65, 0.79], stroke);
  if (!detailed) return frame || stand || insideDisc(x, y, 0.5, 0.44, 0.1);
  const host = [0.5, 0.45];
  const viewers = [
    [0.5, 0.31],
    [0.38, 0.53],
    [0.62, 0.53],
  ];
  const stage =
    insideDisc(x, y, host[0], host[1], 0.055) ||
    viewers.some(
      ([vx, vy]) => insideDisc(x, y, vx, vy, 0.04) || insideSegment(x, y, host, [vx, vy], 0.03),
    );
  return frame || stand || stage;
}

function render(size) {
  const detailed = size >= 48;
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
          if (insideScreen(x, y, detailed)) foreground++;
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
