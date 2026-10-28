// Draws the app icon (a white envelope on indigo) and writes public/icon-192.png and public/icon-512.png.
// Run with: node scripts/make-icons.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Colour of one point of the icon; x and y go from 0 to 1.
function colorAt(x, y) {
  const bg = [79, 70, 229], white = [255, 255, 255];
  const inside = x > 0.24 && x < 0.76 && y > 0.33 && y < 0.67;
  if (!inside) return bg;
  const line = 0.022;
  const onFlap =
    distToSegment(x, y, 0.24, 0.33, 0.5, 0.52) < line || distToSegment(x, y, 0.76, 0.33, 0.5, 0.52) < line;
  return onFlap ? bg : white;
}

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const n = 3; // 3x3 samples per pixel makes the edges smooth
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < n; sy++) for (let sx = 0; sx < n; sx++) {
        const c = colorAt((px + (sx + 0.5) / n) / size, (py + (sy + 0.5) / n) / size);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = r / (n * n); raw[o + 1] = g / (n * n); raw[o + 2] = b / (n * n); raw[o + 3] = 255;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0); head.writeUInt32BE(size, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync('public', { recursive: true });
for (const s of [192, 512]) fs.writeFileSync(`public/icon-${s}.png`, png(s));
console.log('Icons written to public/');
