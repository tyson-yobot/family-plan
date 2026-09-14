// Generates the app icons for the home-screen install, into web/public.
//
// The icon is five dots, one per person in their own accent colour, on the
// same warm background the worksheets use. Deliberately not a logo or a
// wordmark: this is a private family tool, not a product.
//
// Run from the repo root: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'web', 'public');

const BACKGROUND = [0xfb, 0xf8, 0xf4];
const DOTS = [
  [0x0f, 0x76, 0x6e], // Tyson, teal
  [0xc0, 0x45, 0x3a], // Danyell, coral
  [0xb4, 0x53, 0x09], // Aidan, amber
  [0xbe, 0x18, 0x5d], // Mariah, pink
  [0x43, 0x38, 0xca], // Dylan, indigo
];

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Positions the five dots: two on top, three below, centred. */
function dotCentres(size) {
  const r = size * 0.088;
  const gapX = size * 0.225;
  const topY = size * 0.395;
  const bottomY = size * 0.635;
  return [
    { x: size / 2 - gapX / 2, y: topY, r },
    { x: size / 2 + gapX / 2, y: topY, r },
    { x: size / 2 - gapX, y: bottomY, r },
    { x: size / 2, y: bottomY, r },
    { x: size / 2 + gapX, y: bottomY, r },
  ];
}

function renderPng(size) {
  const centres = dotCentres(size);
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    row[0] = 0; // no per-row filter
    for (let x = 0; x < size; x++) {
      let colour = BACKGROUND;
      let coverage = 0;
      for (let i = 0; i < centres.length; i++) {
        const c = centres[i];
        const distance = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        // Soften the last pixel of the edge so the dots do not look jagged.
        const edge = Math.min(Math.max(c.r + 0.5 - distance, 0), 1);
        if (edge > coverage) {
          coverage = edge;
          colour = DOTS[i];
        }
      }
      const offset = 1 + x * 3;
      for (let channel = 0; channel < 3; channel++) {
        row[offset + channel] = Math.round(
          BACKGROUND[channel] * (1 - coverage) + colour[channel] * coverage,
        );
      }
    }
    rows.push(row);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  const png = renderPng(size);
  writeFileSync(join(outDir, name), png);
  console.log(`${name}: ${size}x${size}, ${png.length} bytes`);
}
