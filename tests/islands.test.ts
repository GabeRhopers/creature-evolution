import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { IslandLand, islandCols, islandProfile, jag, type IslandLike } from '../src/systems/islandShape';

const P = 4;
const surfaceY = BALANCE.world.surfaceY;
const aboveRows = Math.floor((surfaceY - 4) / P);
const W = BALANCE.world.width;
const islands = BALANCE.terrain.islands as IslandLike[];

describe('islands: one shape for the drawing and the land', () => {
  it('every style has land in the middle and none at the edges', () => {
    for (const style of ['sand', 'mangrove', 'iceberg', 'volcano', 'cave'] as const) {
      const pr = islandProfile({ x: 1000, width: 800, depth: 200, style }, 0, P, aboveRows);
      expect(pr.cols).toBe(islandCols(800, P));
      expect(pr.land[Math.floor(pr.cols / 2)], style).toBeGreaterThan(0);
      expect(pr.land[0], style).toBe(0);
      expect(pr.land[pr.cols - 1], style).toBe(0);
      expect(Math.max(...pr.land), style).toBeLessThan(aboveRows);
    }
  });
  it('a mangrove has a low mud bank to stand on (it used to be an invisible ledge)', () => {
    const pr = islandProfile({ x: 1000, width: 800, depth: 200, style: 'mangrove' }, 0, P, aboveRows);
    expect(Math.max(...pr.land)).toBe(2);
  });
  it("an iceberg's jagged peak is the same every time (no random draws)", () => {
    const a = islandProfile({ x: 1000, width: 900, depth: 300, style: 'iceberg' }, 3, P, aboveRows);
    const b = islandProfile({ x: 1000, width: 900, depth: 300, style: 'iceberg' }, 3, P, aboveRows);
    expect([...a.land]).toEqual([...b.land]);
    expect(jag(5, 63)).toBeGreaterThanOrEqual(0);
    expect(jag(5, 63)).toBeLessThan(1);
  });
  it('the land lookup matches each profile column, across the whole sea', () => {
    const land = new IslandLand(islands, W, surfaceY, P, aboveRows);
    for (const pr of land.profiles) {
      if (pr.style === 'cave') continue; // the Trench's cave rocks overlap on purpose: the higher one wins
      const c = Math.floor(pr.cols / 2);
      const h = pr.land[c];
      expect(land.topAt(pr.left + c * P + P / 2)).toBe(surfaceY - h * P);
      expect(land.topAt(pr.left - 5 * P)).toBeNull();
    }
  });
  it('land is solid only above the water, between its top and the surface', () => {
    const land = new IslandLand(islands, W, surfaceY, P, aboveRows);
    const pr = land.profiles.find((p) => p.style === 'iceberg')!;
    const c = Math.floor(pr.cols / 2);
    const x = pr.left + c * P + P / 2;
    const top = land.topAt(x)!;
    expect(land.solidAt(x, top + 2)).toBe(true);
    expect(land.solidAt(x, top - 2)).toBe(false);
    expect(land.solidAt(x, surfaceY + 10)).toBe(false);
    // A body wider than one column feels the highest land under it.
    expect(land.highestTop(x - 40, x + 40)).toBeLessThanOrEqual(top);
  });
  it('the loop: land at x and x + width is the same', () => {
    const land = new IslandLand(islands, W, surfaceY, P, aboveRows);
    const x = land.profiles[0].x;
    expect(land.topAt(x + W)).toBe(land.topAt(x));
  });
});
