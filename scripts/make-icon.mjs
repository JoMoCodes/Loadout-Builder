// Draws the app icon: a delivery van on a square in the app's accent colour.
//
//   node scripts/make-icon.mjs
//
// Writes apps/desktop/build/icon.png (512 x 512) and apps/desktop/build/icon.ico (16 to 256
// pixels). It needs nothing installed: the picture is drawn here, point by point, and written as
// PNG with Node's own zlib. Run it again after changing the colours below. The colours are the
// accent tokens in apps/desktop/src/renderer/tokens.css (--accent and --accent-text).

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'apps', 'desktop', 'build');

const ACCENT = [0x4e, 0xa1, 0xff]; // --accent
const INK = [0x06, 0x12, 0x1f]; // --accent-text

// ---- The picture, in a 256 x 256 square. Each shape says whether a point is inside it.

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

const circle = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const polygon = (points) => (x, y) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// Painted in this order; the last shape that holds a point decides its colour.
const SHAPES = [
  [roundedRect(0, 0, 256, 256, 56), ACCENT],
  // The cargo box and the cab.
  [roundedRect(32, 72, 176, 178, 12), INK],
  [
    polygon([
      [168, 96],
      [194, 96],
      [226, 134],
      [226, 178],
      [168, 178],
    ]),
    INK,
  ],
  // The cab window.
  [
    polygon([
      [182, 108],
      [194, 108],
      [212, 134],
      [182, 134],
    ]),
    ACCENT,
  ],
  // A stripe along the cargo box.
  [roundedRect(48, 100, 160, 110, 3), ACCENT],
  // The wheels: a gap in the body, the tyre, the hub.
  [circle(86, 180, 33), ACCENT],
  [circle(86, 180, 26), INK],
  [circle(86, 180, 10), ACCENT],
  [circle(190, 180, 33), ACCENT],
  [circle(190, 180, 26), INK],
  [circle(190, 180, 10), ACCENT],
];

function colourAt(x, y) {
  let colour = null;
  for (const [inside, rgb] of SHAPES) if (inside(x, y)) colour = rgb;
  return colour;
}

/** Draws the picture at `size` pixels square: RGBA bytes, with smooth edges. */
function render(size) {
  const samples = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const scale = 256 / size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const colour = colourAt(
            (px + (sx + 0.5) / samples) * scale,
            (py + (sy + 0.5) / samples) * scale,
          );
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            covered += 1;
          }
        }
      }
      const at = (py * size + px) * 4;
      if (covered > 0) {
        pixels[at] = Math.round(r / covered);
        pixels[at + 1] = Math.round(g / covered);
        pixels[at + 2] = Math.round(b / covered);
        pixels[at + 3] = Math.round((covered / (samples * samples)) * 255);
      }
    }
  }
  return pixels;
}

// ---- PNG and ICO files

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function png(size) {
  const pixels = render(size);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // red, green, blue and see-through
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    // Each row starts with a 0: no filter.
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function ico(sizes) {
  const images = sizes.map((size) => png(size));
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2); // an icon file
  head.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  sizes.forEach((size, i) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; // 0 means 256
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[i].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[i].length;
    entries.push(entry);
  });
  return Buffer.concat([head, ...entries, ...images]);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'icon.png'), png(512));
writeFileSync(resolve(outDir, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
console.log('Wrote apps/desktop/build/icon.png and icon.ico');
