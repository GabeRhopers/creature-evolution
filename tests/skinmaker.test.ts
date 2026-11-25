// Sprite Studio "New skin": the picture -> hero skin engine (public/studio/skinmaker.js) and the game's skin list.
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain browser module without type declarations
import * as SM from '../public/studio/skinmaker.js';
import fang from '../public/studio/seeds/fang-juvenile.json';
import { heroSkins, validateProject, type StudioProject, type StudioSummary } from '../src/skins';

const HERO = fang as unknown as StudioProject;
const NAVY = [35, 49, 84];
type Grid = number[][];
const swim: Grid = SM.decodeGrid(HERO.poses.find((p) => p.name === 'move')!.frames[0], HERO.w, HERO.h);
const bite: Grid = SM.decodeGrid(HERO.poses.find((p) => p.name === 'attack')!.frames.at(-1)!, HERO.w, HERO.h);

/** A sprite sheet like the ones Rhopers sends: poses at 4x on a navy background, with small text labels. */
function sheet(items: Array<{ g: Grid; x: number; y: number }>, labels: Array<{ x: number; y: number }>, w = 1000, h = 700) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set([...NAVY, 255], i * 4);
  const put = (x: number, y: number, rgb: number[]) => { if (x >= 0 && y >= 0 && x < w && y < h) data.set([...rgb, 255], (y * w + x) * 4); };
  for (const { g, x, y } of items)
    g.forEach((row, gy) => row.forEach((v, gx) => {
      if (v < 0) return;
      const rgb = SM.hexToRgb(HERO.palette[v]);
      for (let k = 0; k < 16; k++) put(x + gx * 4 + (k % 4), y + gy * 4 + (k >> 2), rgb);
    }));
  for (const l of labels) for (let yy = 0; yy < 12; yy++) for (let xx = 0; xx < 60; xx++) put(l.x + xx, l.y + yy, [255, 255, 255]);
  return { w, h, data };
}

describe('skin maker', () => {
  // Row 1 (label "SWIM"): the swim pose facing right, then facing left. Row 2 (label "BITE"): a bite.
  const img = sheet(
    [{ g: swim, x: 20, y: 40 }, { g: SM.flipGrid(swim), x: 480, y: 40 }, { g: bite, x: 20, y: 400 }],
    [{ x: 20, y: 10 }, { x: 20, y: 370 }],
  );
  const found = SM.findSprites(img);

  it('finds the poses on the background and skips the labels', () => {
    expect(found.bg.transparent).toBe(false);
    expect(found.sprites.length).toBe(3);
    expect(found.sprites.map((s: { group: number }) => s.group)).toEqual([0, 0, 1]);
  });
  it('guesses the poses by group and which way each faces', () => {
    expect(SM.guessPoses(found.sprites)).toEqual(['move', 'move', 'attack']);
    const scale = SM.fitScale(found.sprites, HERO.w, HERO.h);
    const facing = found.sprites.map((s: unknown) => SM.facesRight(SM.mapColors(SM.sampleSprite(img, found.labels, s, scale), SM.ENDESGA32), swim));
    expect(facing).toEqual([true, false, true]);
  });
  it('makes a valid skin for all three stages, on the hero canvas', () => {
    const choices = [{ pose: 'move', flip: false }, { pose: 'move', flip: true }, { pose: 'attack', flip: false }];
    const skin = SM.makeSkin(img, found, choices, HERO, { shell: 'beige' });
    for (const st of ['hatchling', 'juvenile', 'adult']) {
      const p = skin[st] as StudioProject;
      expect(validateProject(p)).toEqual([]);
      expect([p.w, p.h, p.framework, p.pixelScale]).toEqual([HERO.w, HERO.h, HERO.framework, HERO.pixelScale]);
      // Nothing touches the canvas edge (the framework margin).
      const g: Grid = SM.decodeGrid(p.poses.find((x) => x.name === 'move')!.frames[0], p.w, p.h);
      const b = SM.bbox(g);
      expect(b.x0).toBeGreaterThan(0);
      expect(b.x1).toBeLessThan(p.w - 1);
    }
    expect(skin.juvenile.mouth[0]).toBeGreaterThan(HERO.w / 2);
    // The hatchling is inside a beige egg; the egg is its hit circle.
    expect(skin.hatchling.palette).toContain('#ead4aa');
    expect(skin.hatchling.bodyRadius).toBeGreaterThanOrEqual(3);
    // Every color is the game's palette or one of at most three signature colors.
    expect(skin.juvenile.palette.filter((c: string) => !SM.ENDESGA32.includes(c)).length).toBeLessThanOrEqual(3);
  });
  it('fills missing poses: one swim frame gets a tail sway, and a bite opens the jaw', () => {
    const skin = SM.makeSkin(img, found, [{ pose: 'move', flip: false }, { pose: 'skip', flip: false }, { pose: 'skip', flip: false }], HERO);
    const pose = (n: string) => skin.juvenile.poses.find((p: { name: string }) => p.name === n);
    expect(pose('move').frames.length).toBe(4);
    expect(new Set(pose('move').frames).size).toBeGreaterThan(1);
    expect(pose('attack').frames.length).toBe(2);
    expect(pose('attack').frames[1]).not.toBe(pose('attack').frames[0]);
  });
  it('color versions change the colors but keep the outline and the pixels', () => {
    for (const v of Object.keys(SM.VARIANTS)) {
      const r = SM.recolor(HERO, v);
      expect(r.poses).toBe(HERO.poses);
      expect(r.palette.length).toBe(HERO.palette.length);
      expect(r.palette[HERO.palette.indexOf('#181425')]).toBe('#181425');
      expect(r.palette.filter((c: string, i: number) => c !== HERO.palette[i]).length).toBeGreaterThan(2);
    }
  });
  it('reads transparent pictures', () => {
    const t = sheet([{ g: swim, x: 10, y: 10 }], [], 500, 250);
    for (let i = 0; i < t.w * t.h; i++) if (t.data[i * 4] === NAVY[0] && t.data[i * 4 + 1] === NAVY[1]) t.data[i * 4 + 3] = 0;
    const f = SM.findSprites(t);
    expect(f.bg.transparent).toBe(true);
    expect(f.sprites.length).toBe(1);
  });
});

describe('hero skins in the game', () => {
  const p = (id: string, hero: string, set: string, stage: string, updatedAt = '2026-11-25T10:00:00Z'): StudioSummary => ({ id, name: id, updatedAt, skinOf: { hero, name: 'Blue', set, stage } });
  it('lists complete skins for the hero only', () => {
    const list = [
      p('sk-a-hatchling', 'fang', 'sk-a', 'hatchling'), p('sk-a-juvenile', 'fang', 'sk-a', 'juvenile'), p('sk-a-adult', 'fang', 'sk-a', 'adult'),
      p('sk-b-adult', 'fang', 'sk-b', 'adult'), // incomplete
      p('sk-c-hatchling', 'mosa', 'sk-c', 'hatchling'), p('sk-c-juvenile', 'mosa', 'sk-c', 'juvenile'), p('sk-c-adult', 'mosa', 'sk-c', 'adult'),
      { id: 'fang-adult', name: 'Fang', updatedAt: '' },
    ];
    expect(heroSkins(list, 'fang', ['hatchling', 'juvenile', 'adult']).map((s) => s.set)).toEqual(['sk-a']);
    expect(heroSkins(list, 'mosa', ['hatchling', 'juvenile', 'adult']).map((s) => s.set)).toEqual(['sk-c']);
  });
});
