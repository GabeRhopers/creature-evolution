import { describe, expect, it } from 'vitest';
import { BALANCE, biomeWeight } from '../src/data';
import { keptShare, outgrownMul, regionDensities, regionFactors, trimCrowd, type CrowdConfig } from '../src/systems/crowd';

const cfg = BALANCE.crowd as CrowdConfig;
const regions = BALANCE.regions.list;
const counts = Object.fromEntries(Object.entries(BALANCE.population as Record<string, number>).map(([id, n]) => [id, n * BALANCE.world.populationScale]));

describe('crowd control (Nov 23)', () => {
  it('no region is denser than the cap once thinned', () => {
    const dens = regionDensities(counts, biomeWeight, regions);
    const f = regionFactors(dens, cfg.regionMaxDensity);
    for (const r of regions) expect(dens[r.id] * f[r.id], r.id).toBeLessThanOrEqual(cfg.regionMaxDensity + 1e-9);
    // the busy ones really get thinned, the quiet ones are left alone
    expect(f.swamp).toBeLessThan(1);
    expect(f.volcano).toBe(1);
  });
  it('a species keeps the share of its home regions that survives thinning', () => {
    const dens = regionDensities(counts, biomeWeight, regions);
    const f = regionFactors(dens, cfg.regionMaxDensity);
    expect(keptShare('archerfish', biomeWeight, regions, f)).toBeCloseTo(f.swamp, 6); // lives only in the swamp
    expect(keptShare('x', () => 0, regions, f)).toBe(1);
  });
  it('fish far weaker than the player mostly hide', () => {
    expect(outgrownMul(100, 10, cfg)).toBe(cfg.outgrownShare);
    expect(outgrownMul(100, 50, cfg)).toBe(1);
  });
  it('the screen budget only sends off-screen fish to nap, farthest first', () => {
    const near = [{ d: 100, onScreen: true }, { d: 900, onScreen: false }, { d: 1500, onScreen: false }, { d: 1200, onScreen: true }];
    expect(trimCrowd(near, 2)).toEqual([2, 1]);
    expect(trimCrowd(near, 3)).toEqual([2]);
    expect(trimCrowd(near, 4)).toEqual([]);
    // never trims fish in view, even if that leaves more than the budget
    expect(trimCrowd([{ d: 1, onScreen: true }, { d: 2, onScreen: true }], 1)).toEqual([]);
  });
  it('limits are sane', () => {
    expect(cfg.nearWake).toBeLessThan(cfg.nearMax);
    expect(cfg.maxHuntersTotal).toBeGreaterThanOrEqual(1);
    expect(cfg.maxTideMul).toBeGreaterThanOrEqual(1);
  });
});
