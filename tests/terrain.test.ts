import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { Terrain, type TerrainConfig } from '../src/systems/terrain';

const W = balance.world.width;
const surfaceY = balance.world.surfaceY;
const seabedTop = balance.world.height - balance.world.seabedDepth;
const t = new Terrain(balance.terrain as TerrainConfig, W, surfaceY, seabedTop);
const waterH = seabedTop - surfaceY;
const areas = balance.areas.list;

describe('terrain', () => {
  it('seamount tops reach into the Reef (so juveniles see them), not the Shallows', () => {
    const reef = areas.find((a) => a.id === 'reef')!;
    for (const s of t.cfg.seamounts) {
      const share = (t.groundAt(s.x) - surfaceY) / waterH;
      expect(share).toBeGreaterThan(reef.from);
      expect(share).toBeLessThan(reef.to);
    }
  });

  it('islands stay in the Shallows (so hatchlings see them)', () => {
    const shallows = areas.find((a) => a.id === 'shallows')!;
    for (const isl of t.cfg.islands) {
      const deepest = (t.ceilAt(isl.x) + t.cfg.rootsDepth - surfaceY) / waterH;
      expect(deepest).toBeLessThan(shallows.to);
    }
  });

  it('keeps the player start clear', () => {
    const startY = surfaceY + waterH * balance.playerStartDepth;
    expect(t.isSolid(balance.world.startX, startY, 120)).toBe(false);
  });

  it('the ground never goes below the seabed and dunes stay low', () => {
    for (let x = 0; x <= W; x += 50) expect(t.groundAt(x)).toBeLessThanOrEqual(seabedTop + 0.01);
    // Between features (far from any ridge or seamount) only dunes.
    expect(seabedTop - t.groundAt(4500)).toBeLessThanOrEqual(balance.terrain.dunes.amplitude + 1);
  });

  it('pushes a swimmer out of a seamount wall sideways and off the top upward', () => {
    const s = t.cfg.seamounts[0];
    const top = t.groundAt(s.x);
    const onTop = t.resolve(s.x, top + 5, 20)!;
    expect(onTop.ny).toBeLessThan(-0.85);
    expect(t.isSolid(onTop.x, onTop.y, 19)).toBe(false);
    // A point just inside the steep left wall: the push is mostly sideways (to the left).
    let x = s.x - s.width / 2;
    const y = top + 400;
    while (t.groundAt(x) > y) x += 4;
    const wall = t.resolve(x + 10, y, 20)!;
    expect(wall.nx).toBeLessThan(-0.5);
  });

  it('pushes a swimmer down out of an island sandbank', () => {
    const isl = t.cfg.islands[0];
    const hit = t.resolve(isl.x, t.ceilAt(isl.x) - 10, 15)!;
    expect(hit.ny).toBeGreaterThan(0.9);
    expect(hit.y).toBeGreaterThan(t.ceilAt(isl.x));
    expect(t.resolve(isl.x, t.ceilAt(isl.x) + 100, 15)).toBeNull();
  });

  it('steers AI away from ground it is about to hit', () => {
    const s = t.cfg.seamounts[0];
    const [, ay] = t.avoid(s.x, t.groundAt(s.x) - 50, 200);
    expect(ay).toBeLessThan(0);
    expect(t.avoid(4500, surfaceY + 600, 200)).toEqual([0, 0]);
  });

  it('gives hiding places under every island and on every seamount', () => {
    expect(t.rootZones()).toHaveLength(t.cfg.islands.filter((i) => i.style !== 'iceberg' && i.style !== 'volcano' && i.style !== 'cave').length);
    expect(t.plateaus()).toHaveLength(t.cfg.seamounts.length);
  });
});

describe('scenery layout', () => {
  const sc = balance.scenery;
  const kinds = ['galleon', 'wreck', 'submarine', 'whale', 'ruins', 'arch', 'vent', 'cannon', 'chest', 'helmet', 'anchor'];
  it('uses known pieces inside the world', () => {
    for (const pc of sc.pieces) {
      expect(kinds).toContain(pc.kind);
      expect(pc.x).toBeGreaterThan(100);
      expect(pc.x).toBeLessThan(W - 100);
    }
    for (const k of sc.hide) expect(kinds).toContain(k);
  });
  it('puts big pieces on fairly flat ground, never on a steep seamount wall', () => {
    for (const pc of sc.pieces) expect(Math.abs(t.slopeAt(pc.x)), pc.kind + ' at ' + pc.x).toBeLessThan(0.6);
  });
  it('puts the wreck on a seamount top in the Reef', () => {
    const wreck = sc.pieces.find((p) => p.kind === 'wreck')!;
    expect(t.kindAt(wreck.x)).toBe('seamount');
  });
  it('never overlaps islands, or seamounts and ridges, with each other', () => {
    const overlaps = (list: Array<{ x: number; width: number }>) => {
      const spans = list.map((f) => [f.x - f.width / 2, f.x + f.width / 2]).sort((a, b) => a[0] - b[0]);
      return spans.filter((s, i) => i > 0 && s[0] < spans[i - 1][1]).map((s) => (s[0] + s[1]) / 2);
    };
    const cfg = balance.terrain as unknown as { islands: Array<{ x: number; width: number; style?: string }>; seamounts: Array<{ x: number; width: number }>; ridges: Array<{ x: number; width: number }> };
    // Cave rocks overlap on purpose (together they make one long roof, like over the Twilight Trench).
    expect(overlaps(cfg.islands.filter((i) => i.style !== 'cave'))).toEqual([]);
    expect(overlaps([...cfg.seamounts, ...cfg.ridges])).toEqual([]);
  });
  it('keeps floats in open water, away from islands', () => {
    for (const f of sc.floats) expect(isFinite(t.ceilAt(f.x))).toBe(false);
  });
});

describe('the Twilight Trench is a sea cave (Nov 24)', () => {
  it('has a rock roof over the whole trench, with room to swim under it', () => {
    const trench = balance.regions.list.find((r) => r.id === 'trench')!;
    for (let x = trench.from + 600; x < trench.to - 600; x += 50) {
      expect(isFinite(t.ceilAt(x)), `roof at ${x}`).toBe(true);
      expect(t.groundAt(x) - t.ceilAt(x), `room at ${x}`).toBeGreaterThan(250);
    }
  });
});
