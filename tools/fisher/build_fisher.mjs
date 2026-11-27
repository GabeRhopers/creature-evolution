// The Fisher Ape's drawing (run through convert_fisher.py, which cleans the sheet): the Sprite Studio skin engine samples
// each pose, maps the colors (Endesga 32 plus up to three signature colors) and the poses are placed on the `fisher_ape`
// framework canvas with the feet on the bottom line and the face in the same column, so he never jumps between frames.
// Poses: idle (3), move = walk (3), attack = cast + hook (the hook pose is the straining face while reeling in),
// damage = hook, celebrate = catch + the two celebration frames.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SM from '../../public/studio/skinmaker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = path.join(HERE, '../../public/studio/seeds');
const [raw, w, h, namesJson] = process.argv.slice(2);
const names = JSON.parse(namesJson);
const img = { w: +w, h: +h, data: new Uint8ClampedArray(fs.readFileSync(raw)) };
const W = 48, H = 48, M = 2;
const found = SM.findSprites(img);
const sprites = found.sprites.slice().sort((a, b) => a.x - b.x);
if (sprites.length !== names.length) throw new Error(`expected ${names.length} poses, found ${sprites.length}`);
const scale = SM.fitScale(sprites, W, H, 1);
const rgb = sprites.map((s) => SM.sampleSprite(img, found.labels, s, scale));
const palette = SM.buildPalette(rgb);
const grids = rgb.map((g) => SM.mapColors(g, palette));

// The face: light tan pixels in the top 40% of the drawing (the rod is dark, the belly is lower).
const faceX = (g, src) => {
  const rows = Math.ceil(g.length * 0.4);
  let sx = 0, n = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < g[0].length; x++) {
    const c = src[y][x];
    if (c && c[0] > 170 && c[1] > 120 && c[2] < 140 && c[0] - c[2] > 60) { sx += x; n++; }
  }
  return n ? sx / n : g[0].length / 2;
};
const FACE_X = 21; // canvas column of the face
const place = (g, src) => {
  const out = Array.from({ length: H }, () => new Array(W).fill(-1));
  const fx = Math.round(faceX(g, src));
  const ox = FACE_X - fx, oy = H - M - g.length;
  for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
    const v = g[y][x], X = x + ox, Y = y + oy;
    if (v < 0) continue;
    if (X < M || Y < M || X >= W - M || Y >= H - M) continue;
    out[Y][X] = v;
  }
  return out;
};
const placed = grids.map((g, i) => place(g, rgb[i]));
const c = SM.compactPalette(palette, placed);
const enc = c.grids.map(SM.encodeGrid);
const by = (n) => enc.filter((_, i) => names[i] === n);
const project = {
  name: 'Fisher Ape',
  w: W, h: H, palette: c.palette, framework: 'fisher_ape', bodyRadius: 12, pixelScale: 3, mouth: [38, 10], mouthRadius: 0.6,
  poses: [
    { name: 'idle', fps: 3, frames: by('idle') },
    { name: 'move', fps: 6, frames: by('walk') },
    { name: 'attack', fps: 4, frames: [...by('cast'), ...by('hook')] },
    { name: 'damage', fps: 6, frames: by('hook') },
    { name: 'celebrate', fps: 4, frames: [...by('catch'), ...by('celebrate')] },
    { name: 'rest', fps: 2, frames: by('idle').slice(0, 1) },
  ],
  updatedAt: '2026-11-21T12:00:00.000Z',
  seedVersion: 3,
};
fs.writeFileSync(path.join(SEEDS, 'beast-fisher_ape.json'), JSON.stringify(project));
fs.writeFileSync(path.join(HERE, 'beast-fisher_ape.json'), JSON.stringify(project));
console.log('scale', scale.toFixed(3), 'palette', c.palette.join(' '));
