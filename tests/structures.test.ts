import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { Terrain, type TerrainConfig } from '../src/systems/terrain';

const W = balance.world.width;
const surfaceY = balance.world.surfaceY;
const seabedTop = balance.world.height - balance.world.seabedDepth;
const t = new Terrain(balance.terrain as TerrainConfig, W, surfaceY, seabedTop);
const rocks = t.structures.filter((s) => s.kind === 'rock');
const shelves = t.structures.filter((s) => s.kind === 'shelf');

describe('mid-water structures', () => {
  it('every region has its own mix of structures, all floating clear of the ground and islands', () => {
    const mixes = new Set<string>();
    for (const reg of balance.regions.list) {
      const inside = t.structures.filter((s) => s.x >= reg.from && s.x < reg.to);
      expect(inside.length, reg.id).toBeGreaterThanOrEqual(3);
      mixes.add(inside.map((s) => `${s.kind}@${Math.round(((s.y - surfaceY) / (seabedTop - surfaceY)) * 10)}`).sort().join());
    }
    expect(mixes.size).toBe(balance.regions.list.length);
    // The Sargasso is open ocean (weed mats only); the Volcanic Rift is mostly rock.
    expect(t.structures.filter((s) => s.x >= 38000 && s.x < 54000 && s.kind === 'rock')).toHaveLength(0);
    expect(t.structures.filter((s) => s.x >= 54000 && s.x < 72000 && s.kind === 'rock').length).toBeGreaterThanOrEqual(3);
    for (const s of t.structures) {
      for (let x = s.x - s.rx; x <= s.x + s.rx; x += 20) {
        expect(t.groundAt(x) - (s.y + s.ry)).toBeGreaterThan(150);
        expect(s.y - s.ry - t.ceilAt(x)).toBeGreaterThan(150);
      }
      expect(Math.abs(s.x - balance.world.startX)).toBeGreaterThan(1500);
    }
  });

  it('a rock is solid all round and pushes a swimmer out along its outline', () => {
    const r = rocks[0];
    expect(t.isSolid(r.x, r.y, 10)).toBe(true);
    expect(t.isSolid(r.x, r.y - r.ry - 30, 20)).toBe(false);
    const top = t.resolve(r.x, r.y - r.ry + 5, 20)!;
    expect(top.ny).toBeLessThan(-0.9);
    expect(t.isSolid(top.x, top.y, 19)).toBe(false);
    const side = t.resolve(r.x + r.rx + 5, r.y, 20)!;
    expect(side.nx).toBeGreaterThan(0.9);
    const under = t.resolve(r.x, r.y + r.ry, 20)!;
    expect(under.ny).toBeGreaterThan(0.9);
  });

  it('AI steers away from a rock it swims close to', () => {
    const r = rocks[0];
    const [ax] = t.avoid(r.x - r.rx - 60, r.y, 120);
    expect(ax).toBeLessThan(0);
  });

  it('a shelf stops a swimmer coming down from above, but not one swimming up or beside it', () => {
    const s = shelves[0];
    const r = 20;
    // From above: lands on top.
    expect(t.shelfUnder(s.x, s.y - r - 30, s.y + 10, r)).toBe(s.y);
    // Resting on top stays on top.
    expect(t.shelfUnder(s.x, s.y - r, s.y - r + 6, r)).toBe(s.y);
    // From below, swimming up through it: open water.
    expect(t.shelfUnder(s.x, s.y + 40, s.y - 5, r)).toBeNull();
    expect(t.shelfUnder(s.x, s.y - 5, s.y + 20, r)).toBeNull(); // already partly through
    // Beside it: open water.
    expect(t.shelfUnder(s.x + s.rx + 30, s.y - r - 30, s.y + 10, r)).toBeNull();
    // Shelves are never solid to isSolid / resolve (only one-way).
    expect(t.isSolid(s.x, s.y, 10)).toBe(false);
  });
});
