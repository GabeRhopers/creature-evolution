// Packs every PNG in art/kenney-fish-pack/ and art/player/ into one texture atlas:
//   public/assets/atlas.png + public/assets/atlas.json (Phaser "JSON hash" format)
//
// Each frame gets PAD pixels of padding, and its edge pixels are extruded
// (copied outward) into that padding. Without this, scaled-up sprites sample
// a neighbor's pixels at their borders and show thin colored lines.
//
// Run:  npm run atlas      (re-run whenever you add or change source art)
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const SRC_DIRS = ['art/kenney-fish-pack', 'art/player'];
const OUT_DIR = 'public/assets';
const PAD = 3;
const MAX_WIDTH = 2048;

const files = SRC_DIRS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.png') && !f.endsWith('_outline.png'))
    .sort()
    .map((f) => path.join(dir, f)),
);

const images = files.map((f) => ({
  name: path.basename(f, '.png'),
  png: PNG.sync.read(fs.readFileSync(f)),
}));

// Simple shelf packing (all Kenney frames are 128x128, but stay generic).
let x = 0;
let y = 0;
let shelfH = 0;
let atlasW = 0;
const placed = [];
for (const img of images) {
  const cw = img.png.width + PAD * 2;
  const ch = img.png.height + PAD * 2;
  if (x + cw > MAX_WIDTH) {
    x = 0;
    y += shelfH;
    shelfH = 0;
  }
  placed.push({ ...img, cx: x, cy: y });
  x += cw;
  shelfH = Math.max(shelfH, ch);
  atlasW = Math.max(atlasW, x);
}
const atlasH = y + shelfH;

const atlas = new PNG({ width: atlasW, height: atlasH });
atlas.data.fill(0);

const frames = {};
for (const p of placed) {
  const { width: w, height: h, data } = p.png;
  // Copy with edge extrusion: destination pixel (dx, dy) in the padded cell
  // reads the clamped source pixel.
  for (let dy = 0; dy < h + PAD * 2; dy++) {
    for (let dx = 0; dx < w + PAD * 2; dx++) {
      const sx = Math.min(w - 1, Math.max(0, dx - PAD));
      const sy = Math.min(h - 1, Math.max(0, dy - PAD));
      const si = (sy * w + sx) * 4;
      const di = ((p.cy + dy) * atlasW + (p.cx + dx)) * 4;
      atlas.data[di] = data[si];
      atlas.data[di + 1] = data[si + 1];
      atlas.data[di + 2] = data[si + 2];
      atlas.data[di + 3] = data[si + 3];
    }
  }
  frames[p.name] = {
    frame: { x: p.cx + PAD, y: p.cy + PAD, w, h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w, h },
    sourceSize: { w, h },
  };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'atlas.png'), PNG.sync.write(atlas));
fs.writeFileSync(
  path.join(OUT_DIR, 'atlas.json'),
  JSON.stringify({ frames, meta: { image: 'atlas.png', size: { w: atlasW, h: atlasH }, scale: '1' } }, null, 1),
);
console.log(`atlas: ${placed.length} frames, ${atlasW}x${atlasH}px -> ${OUT_DIR}/atlas.png`);
