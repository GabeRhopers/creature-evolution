import { describe, expect, it } from 'vitest';
import { BALANCE, SPECIES, biomeWeight } from '../src/data';
import { bossPerks, type BossDef } from '../src/systems/bosses';
import { perksEarned, perksOwed } from '../src/systems/perks';

const KELP = ['garibaldi', 'sheephead', 'sea_urchin', 'sea_otter', 'sea_lion'];
const REGIONS = BALANCE.regions.list.map((r: { id: string }) => r.id);

describe('Kelp Forest creatures (Nov 25)', () => {
  it('all five live only in the Kelp Forest and arrive with its Tide (levels 50 to 55)', () => {
    for (const id of KELP) {
      const sp = SPECIES[id];
      expect(sp, id).toBeDefined();
      expect(sp.unlockLevel!, id).toBeGreaterThanOrEqual(50);
      expect(sp.unlockLevel!, id).toBeLessThanOrEqual(55);
      for (const r of REGIONS) expect(biomeWeight(id, r), `${id} in ${r}`).toBe(r === 'kelp' ? 1 : 0);
      expect((BALANCE.population as Record<string, number>)[id], id).toBeGreaterThan(0);
    }
  });
  it('the food web: otters and sheephead eat urchins, the otter is a friend, urchins sting', () => {
    expect(SPECIES.sea_otter.friendly).toBe(true);
    expect(SPECIES.sea_otter.diet).toEqual(['sea_urchin']);
    expect(SPECIES.sheephead.diet).toContain('sea_urchin');
    expect(SPECIES.sea_urchin.venom).toBeGreaterThan(0);
    expect(SPECIES.sea_urchin.maxSpeed).toBeLessThan(40); // it creeps
    expect(SPECIES.sea_lion.behavior.aggression).toBeGreaterThan(0.5);
  });
});

describe('boss reward: a free perk', () => {
  const defs = BALANCE.bosses.list as unknown as BossDef[];
  it('the electric eel gives one free perk pick', () => {
    expect(bossPerks([], defs)).toBe(0);
    expect(bossPerks(['electric_eel'], defs)).toBe(1);
    expect(bossPerks(['electric_eel', 'unknown'], defs)).toBe(1);
  });
  it('a free pick adds to the ones earned by levels', () => {
    const earned = perksEarned(20);
    expect(perksOwed(20, earned)).toBe(0);
    expect(perksOwed(20, earned, 1)).toBe(1);
    expect(perksOwed(20, earned + 1, 1)).toBe(0);
  });
});
