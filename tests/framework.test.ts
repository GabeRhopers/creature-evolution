import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { artFromProject, decodeFrame, isFramed, validateProject, type StudioProject } from '../src/skins';
import { STAGES } from '../src/data';

const FW = JSON.parse(fs.readFileSync('public/studio/frameworks.json', 'utf8'));
/** A framework with its 'extends' chain resolved. */
function framework(name: string): Record<string, unknown> {
  const f = FW[name];
  return f.extends ? { ...framework(f.extends), ...f } : f;
}
const seeds = fs.readdirSync('public/studio/seeds').map((f) => ({ id: f.replace('.json', ''), p: JSON.parse(fs.readFileSync('public/studio/seeds/' + f, 'utf8')) as StudioProject }));

describe('sprite framework', () => {
  it('every framework resolves to the full set of rules', () => {
    for (const name of Object.keys(FW).filter((k) => !k.startsWith('_'))) {
      const f = framework(name);
      for (const key of ['canvas', 'pixelScale', 'margin', 'facing', 'bodyRadius', 'mouth', 'poses']) expect(f[key], `${name}.${key}`).toBeDefined();
    }
  });
  it('the crocodile canvas leaves room for the head and tail', () => {
    const c = framework('crocodile').canvas as number[];
    expect(c[0]).toBeGreaterThanOrEqual(80);
    expect(c[1]).toBeGreaterThanOrEqual(56);
  });
  it('every stage has a shipped design', () => {
    for (const s of STAGES) expect(seeds.map((x) => x.id)).toContain(s.skin);
  });
  for (const { id, p } of seeds) {
    describe(id, () => {
      const f = framework(p.framework!);
      it('is a valid framework drawing on its framework canvas', () => {
        expect(validateProject(p)).toEqual([]);
        expect(isFramed(p)).toBe(true);
        expect([p.w, p.h]).toEqual(f.canvas);
      });
      it('keeps every pixel of every frame out of the margin', () => {
        const m = f.margin as number;
        for (const pose of p.poses)
          pose.frames.forEach((s, i) => {
            const px = decodeFrame(s, p.w * p.h);
            for (let k = 0; k < px.length; k++) {
              if (px[k] < 0) continue;
              const x = k % p.w, y = Math.floor(k / p.w);
              expect(x >= m && y >= m && x < p.w - m && y < p.h - m, `${pose.name}[${i}] pixel ${x},${y}`).toBe(true);
            }
          });
      });
      it('has its mouth in front of the body center and inside the canvas', () => {
        const art = artFromProject(p)!;
        expect(p.mouth![0]).toBeGreaterThan(p.w / 2);
        expect(p.mouth![0]).toBeLessThan(p.w);
        expect(art.radius).toBe(p.bodyRadius! * p.pixelScale!);
        expect(art.mouthReach).toBeGreaterThan(1);
      });
    });
  }
});
