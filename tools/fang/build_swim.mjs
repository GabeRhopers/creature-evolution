// Elder Shark (was Fang) swim update, Nov 26: Rhopers' new sheet (elder_shark_swim_sheet.jpg: an IDLE pose and a SWIM pose
// with the tail curving down, facing left, text labels) becomes the swim animation. Run through update_swim.py.
// 1. The canvas grows from 100x44 to 100x60 (8 rows above and below) so the curved tail fits; every existing frame
//    keeps its place (the mouth moves down 8 rows with it).
// 2. Both poses are found with the Sprite Studio skin engine (labels and the cut-off pose at the bottom are skipped),
//    shrunk to the same size as the current drawing (the idle pose is as long as the current body), mapped to the
//    shark's own palette, turned to face right, and placed with the snout and head where the current frames have them.
// 3. move = [idle, swim]; the still poses (idle, rest) use the new idle. Bite, hurt and the cheer stay as they were.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SM from '../../public/studio/skinmaker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = path.join(HERE, '../../public/studio/seeds');
const PAD = 8;
const [raw, w, h] = process.argv.slice(2);
const img = { w: +w, h: +h, data: new Uint8ClampedArray(fs.readFileSync(raw)) };
const found = SM.findSprites(img);
if (found.sprites.length !== 2) throw new Error('expected 2 poses, found ' + found.sprites.length);

const pad = (s, W, H) => '.'.repeat(W * PAD) + s + '.'.repeat(W * PAD);
/** Mean row of the drawn pixels in the front 8 columns (the head), and the snout column. */
function head(g) {
  const b = SM.bbox(g);
  const ys = [];
  for (let x = b.x1 - 7; x <= b.x1; x++) g.forEach((row, y) => { if (row[x] >= 0) ys.push(y); });
  return { snout: b.x1, y: ys.reduce((a, v) => a + v, 0) / ys.length };
}

const titles = { juvenile: 'Elder Shark 2: Juvenile', adult: 'Elder Shark 3: Adult' };
for (const stage of ['juvenile', 'adult']) {
  const file = path.join(SEEDS, `fang-${stage}.json`);
  const p = JSON.parse(fs.readFileSync(file, 'utf8'));
  const W = p.w, H0 = p.h, H = H0 + 2 * PAD;
  if (H0 !== 44) throw new Error(`fang-${stage} is already ${W}x${H0}`);
  for (const po of p.poses) po.frames = po.frames.map((f) => pad(f, W, H0));
  p.h = H;
  p.mouth = [p.mouth[0], p.mouth[1] + PAD];
  const ref = SM.decodeGrid(p.poses.find((x) => x.name === 'move').frames[0], W, H);
  const at = head(ref);
  const refLen = SM.bbox(ref).x1 - SM.bbox(ref).x0 + 1;
  const scale = refLen / found.sprites[0].w; // the idle pose is as long as the current body
  const frames = found.sprites.map((s) => {
    const g = SM.flipGrid(SM.mapColors(SM.sampleSprite(img, found.labels, s, scale), p.palette));
    const hd = head(g);
    const out = Array.from({ length: H }, () => new Array(W).fill(-1));
    const dx = at.snout - hd.snout, dy = Math.round(at.y - hd.y);
    g.forEach((row, y) => row.forEach((v, x) => {
      const X = x + dx, Y = y + dy;
      if (v >= 0 && X >= 2 && Y >= 2 && X < W - 2 && Y < H - 2) out[Y][X] = v;
    }));
    return SM.encodeGrid(out);
  });
  const pose = (n) => p.poses.find((x) => x.name === n);
  pose('move').frames = frames;
  pose('idle').frames = [frames[0]];
  pose('rest').frames = [frames[0]];
  p.name = titles[stage];
  p.seedVersion = 4;
  fs.writeFileSync(file, JSON.stringify(p));
  console.log(stage, 'scale', scale.toFixed(4), 'mouth', p.mouth, 'canvas', W, H);
}
