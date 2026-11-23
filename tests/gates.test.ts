import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { canBreak, crackStage, loopDx, openedFromSave, pushOut, type GatesConfig } from '../src/systems/gates';

const cfg = (BALANCE as unknown as { gates: GatesConfig }).gates;
const W = BALANCE.world.width;

describe('gates between regions (Nov 23)', () => {
  it('sit on the region borders, one per Tide crab, the Frozen Sea walled on both sides', () => {
    const borders = BALANCE.regions.list.map((r) => r.from);
    for (const g of cfg.list) {
      const near = borders.some((b) => Math.abs(loopDx(g.x, b, W)) <= 200);
      expect(near, g.id).toBe(true);
      expect(g.crab % BALANCE.checkpointCrab.everyLevels, g.id).toBe(0);
      expect(g.hits, g.id).toBeGreaterThan(0);
    }
    expect(cfg.list.map((g) => g.crab)).toEqual([10, 20, 30, 30]);
    expect(cfg.list.filter((g) => g.opens === 'Frozen Sea').length).toBe(2);
  });
  it('keep the start in the Coral Sea, between the Root Tangle and the west Ice Wall', () => {
    const start = BALANCE.world.startX;
    const east = cfg.list.find((g) => g.id === 'root_tangle')!, west = cfg.list.find((g) => g.id === 'ice_wall_west')!;
    expect(loopDx(start, east.x, W)).toBeLessThan(0);
    expect(loopDx(start, west.x, W)).toBeGreaterThan(0);
  });
  it('stay clear of islands', () => {
    for (const g of cfg.list) for (const isl of BALANCE.terrain.islands) {
      expect(Math.abs(loopDx(g.x, isl.x, W)), `${g.id} vs island at ${isl.x}`).toBeGreaterThan(isl.width / 2 + cfg.thickness / 2);
    }
  });
  it('open only after the Tide crab is beaten', () => {
    const g = cfg.list[0];
    expect(canBreak(g, 0)).toBe(false);
    expect(canBreak(g, g.crab - 1)).toBe(false);
    expect(canBreak(g, g.crab)).toBe(true);
  });
  it('crack in three stages', () => {
    expect([0, 1, 2, 3, 4, 5].map((h) => crackStage(h, 5))).toEqual([0, 1, 2, 2, 3, 3]);
  });
  it('push a swimmer back to the side it came from, across the loop too', () => {
    expect(pushOut(1000, 20, 2000, 80, W)).toBeNull();
    expect(pushOut(1950, 20, 2000, 80, W)).toEqual({ x: 1900, side: -1 });
    expect(pushOut(2050, 20, 2000, 80, W)).toEqual({ x: 2100, side: 1 });
    const r = pushOut(-5, 20, W - 100, 80, W)!; // just past the seam, touching the west wall
    expect(r.side).toBe(1);
    expect(r.x).toBeCloseTo(0, 6);
  });
  it('folds distances around the loop', () => {
    expect(loopDx(100, W - 100, W)).toBe(200);
    expect(loopDx(W - 100, 100, W)).toBe(-200);
  });
  it('a save from before gates keeps the whole sea open; a new save keeps only its broken gates', () => {
    expect(openedFromSave(undefined, cfg.list)).toEqual(cfg.list.map((g) => g.id));
    expect(openedFromSave([], cfg.list)).toEqual([]);
    expect(openedFromSave(['root_tangle', 'nope'], cfg.list)).toEqual(['root_tangle']);
  });
});
