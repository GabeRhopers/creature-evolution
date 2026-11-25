// Spino, the sixth hero: built from Rhopers' sheet (spino_sheet.jpg: two swim poses on top, two bites below, all
// facing left, with water splashes) by the same engine as Sprite Studio's "New skin" (public/studio/skinmaker.js).
// Run through convert_spino.py, which decodes the JPEG:   python3 convert_spino.py
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as SM from '../../public/studio/skinmaker.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEEDS = path.join(HERE, '../../public/studio/seeds');
const [raw, w, h] = process.argv.slice(2);
const img = { w: +w, h: +h, data: new Uint8ClampedArray(fs.readFileSync(raw)) };
// The canvas: long and low like Fang's, a little taller for the sail.
const hero = { w: 112, h: 52, framework: 'spino', bodyRadius: 14, pixelScale: 2, mouthRadius: 0.7 };
const found = SM.findSprites(img);
if (found.sprites.length !== 4) throw new Error('expected 4 poses, found ' + found.sprites.length);
const poses = SM.guessPoses(found.sprites); // top row swim, bottom row bite
const choices = poses.map((pose) => ({ pose, flip: true })); // every pose faces left on the sheet
const skin = SM.makeSkin(img, found, choices, hero, { shell: 'white', hide: 0.4 });
const STAMP = '2026-11-21T12:00:00.000Z';
const titles = { hatchling: 'Spino 1: Hatchling', juvenile: 'Spino 2: Juvenile', adult: 'Spino 3: Adult' };
for (const stage of ['hatchling', 'juvenile', 'adult']) {
  const p = skin[stage];
  // The level-up cheer: the open-jawed bites (a roar). The hurt flash: the first swim pose (the game flashes it).
  const pose = (n) => p.poses.find((x) => x.name === n);
  pose('celebrate').frames = pose('attack').frames.slice(-2);
  pose('celebrate').fps = 4;
  const out = { name: titles[stage], ...p, updatedAt: STAMP, seedVersion: stage === 'hatchling' ? 5 : 3 };
  fs.writeFileSync(path.join(SEEDS, `spino-${stage}.json`), JSON.stringify(out));
  fs.writeFileSync(path.join(HERE, `spino-${stage}.json`), JSON.stringify(out));
}
console.log('palette', skin.juvenile.palette.join(' '), 'mouth', skin.juvenile.mouth.join(','));
