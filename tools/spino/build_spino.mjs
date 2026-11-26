// Spino, the sixth hero. Since Nov 26 each stage has its own sheet from Rhopers and Mike (brown, sail-backed, facing left):
// spino_hatchling_sheet.jpg (still inside its egg), spino_juvenile_sheet.jpg and spino_adult_sheet.jpg (yellow stripes),
// each with four labeled poses top to bottom: IDLE, SWIM, SWIM ATTACK, HURT. Built with the Sprite Studio skin engine
// (public/studio/skinmaker.js): find the poses (labels, splash and blood dots skipped), turn them to face right, map the
// colors (Endesga 32 plus up to three signature colors per stage) and place them on the `spino` framework (112x52) with
// the snout fixed. Swim = idle + swim, bite = swim + swim attack (the jaw snaps), hurt = hurt, roar = the bite.
// (The first Spino, Nov 25, was blue and built from spino_sheet.jpg, two swims and two bites for every stage.)
// Run through convert_spino.py, which decodes the JPEGs:   python3 convert_spino.py
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SM from '../../public/studio/skinmaker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = path.join(HERE, '../../public/studio/seeds');
const hero = { w: 112, h: 52, framework: 'spino', bodyRadius: 14, pixelScale: 2, mouthRadius: 0.7 };
const STAMP = '2026-11-21T12:00:00.000Z';
const VERSION = 6; // newer than the blue Spino (hatchling 5, juvenile and adult 3)
const titles = { hatchling: 'Spino 1: Hatchling', juvenile: 'Spino 2: Juvenile', adult: 'Spino 3: Adult' };
// Hit circle: the hatchling's egg-wrapped body is a little rounder.
const radius = { hatchling: 16, juvenile: 14, adult: 14 };

// Mike's browns, measured on the sheets (k-means of the body colors): body, shade and sail, light belly. Endesga 32's
// nearest colors read red-orange, so these three are Spino's signature colors (the adult's yellow stripes are Endesga's).
const SIGNATURE = ['#935939', '#6a3d22', '#b58265'];

/** Background-white pockets closed in by legs or the tail (not connected to the picture's edge) become transparent:
 * near-pure white areas bigger than a tooth. The egg's shell is off-white, so it stays. */
function clearPockets(img, minArea = 120) {
  const { w, h, data } = img;
  const white = (i) => data[i * 4] > 244 && data[i * 4 + 1] > 244 && data[i * 4 + 2] > 244;
  const seen = new Uint8Array(w * h);
  const stack = [];
  let cleared = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !white(i)) continue;
    const region = [];
    stack.push(i); seen[i] = 1;
    let edge = false;
    while (stack.length) {
      const j = stack.pop(); region.push(j);
      const x = j % w, y = (j / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const k of [j - 1, j + 1, j - w, j + w]) if (k >= 0 && k < w * h && !seen[k] && Math.abs((k % w) - x) <= 1 && white(k)) { seen[k] = 1; stack.push(k); }
    }
    if (!edge && region.length >= minArea) { for (const j of region) data[j * 4 + 3] = 0; cleared++; }
  }
  return cleared;
}

const args = process.argv.slice(2);
const out = {};
for (let k = 0; k < args.length; k += 4) {
  const [stage, raw, w, h] = args.slice(k, k + 4);
  const img = { w: +w, h: +h, data: new Uint8ClampedArray(fs.readFileSync(raw)) };
  const pockets = clearPockets(img);
  const found = SM.findSprites(img);
  if (found.sprites.length !== 4) throw new Error(`${stage}: expected 4 poses, found ${found.sprites.length}`);
  // Top to bottom: idle, swim, swim attack, hurt.
  const order = found.sprites.map((s, i) => [s, i]).sort((a, b) => (a[0].y0 + a[0].y1) - (b[0].y0 + b[0].y1)).map(([, i]) => i);
  const sprites = order.map((i) => found.sprites[i]);
  const scale = SM.fitScale(sprites, hero.w, hero.h, 1);
  const rgb = sprites.map((s) => SM.sampleSprite(img, found.labels, s, scale));
  const palette = SM.ENDESGA32.concat(SIGNATURE);
  const [idle, swim, bite, hurt] = rgb.map((g) => SM.flipGrid(SM.mapColors(g, palette)));
  const p = SM.assemble(
    [{ grid: idle, pose: 'move' }, { grid: swim, pose: 'move' }, { grid: swim, pose: 'attack' }, { grid: bite, pose: 'attack' }, { grid: hurt, pose: 'damage' }, { grid: bite, pose: 'celebrate' }, { grid: idle, pose: 'celebrate' }],
    palette,
    hero,
  );
  const pose = (n) => p.poses.find((x) => x.name === n);
  pose('celebrate').fps = 4;
  out[stage] = { name: titles[stage], ...p, bodyRadius: radius[stage], updatedAt: STAMP, seedVersion: VERSION };
}
for (const [stage, p] of Object.entries(out)) {
  fs.writeFileSync(path.join(SEEDS, `spino-${stage}.json`), JSON.stringify(p));
  fs.writeFileSync(path.join(HERE, `spino-${stage}.json`), JSON.stringify(p));
  console.log(stage, 'palette', p.palette.join(' '), 'mouth', p.mouth.join(','));
}
