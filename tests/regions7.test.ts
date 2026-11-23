import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { migrateX, Regions, type RegionsConfig } from '../src/systems/regions';
import { twistFor } from '../src/systems/regionTwists';

const regions = new Regions(BALANCE.regions as unknown as RegionsConfig, BALANCE.world.width);

describe('the 7-region sea (Nov 23)', () => {
  it('goes from the tropics into the deep and up to the poles', () => {
    expect(BALANCE.regions.list.map((r) => r.name)).toEqual(['Coral Sea', 'Mangrove Swamp', 'Sargasso Drift', 'Volcanic Rift', 'Twilight Trench', 'Kelp Forest', 'Frozen Sea']);
  });
  it('has a gate at every border, a new Tide crab for each region', () => {
    const gates = BALANCE.gates.list;
    for (const r of BALANCE.regions.list.slice(1)) expect(gates.some((g) => g.x === r.from), r.id).toBe(true);
    expect(gates.find((g) => g.id === 'weed_raft')?.action).toBe('bite');
    expect(gates.find((g) => g.id === 'kelp_curtain')?.action).toBe('bite');
    expect(gates.find((g) => g.id === 'trench_lip')?.action).toBe('ram');
  });
  it('moves old saves to the same place in the new sea', () => {
    expect(migrateX(4500, undefined, 114000)).toBe(4500); // Coral Sea
    expect(migrateX(30000, undefined, 114000)).toBe(30000); // Swamp
    expect(regions.at(migrateX(47000, undefined, 114000)).id).toBe('volcano');
    expect(regions.at(migrateX(64000, undefined, 114000)).id).toBe('ice');
    expect(migrateX(63000, 114000, 114000)).toBe(63000); // new saves stay put
  });
  it('gives each new region its twist', () => {
    expect(twistFor('sargasso').current).toBeGreaterThan(0);
    expect(twistFor('trench').dark).toBeGreaterThan(0.5);
    expect(twistFor('trench').vision).toBeLessThan(1);
    expect(twistFor('kelp').bigSlow).toBeLessThan(1);
    expect(twistFor('coral').current).toBe(0);
  });
  it('puts floating weed mats over the Sargasso Drift and many kelp patches in the Kelp Forest', () => {
    const weed = BALANCE.scenery.floats.filter((f) => f.kind === 'weed');
    expect(weed.length).toBeGreaterThanOrEqual(10);
    expect(weed.every((f) => regions.at(f.x).id === 'sargasso')).toBe(true);
  });
});
