import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { BALANCE, SPECIES, STAGES, biomeWeight } from '../src/data';
import { formAt } from '../src/systems/growth';
import { Regions, pickHomeX, type RegionsConfig } from '../src/systems/regions';
import { validateProject, type StudioProject } from '../src/skins';

const croc = SPECIES.crocodile;
const player = (level: number) => formAt(croc, level, true);
const ai = (id: string, level = 1) => formAt(SPECIES[id], level, false);
const bites = (id: string, playerLevel: number) => player(playerLevel).rank <= ai(id).rank * BALANCE.combat.aiBiteMaxSizeRatio;
const pop = BALANCE.population as Record<string, number>;
const regions = new Regions(BALANCE.regions as unknown as RegionsConfig, BALANCE.world.width);
const seeds = readdirSync('public/studio/seeds').map((f) => f.replace('.json', ''));
const palette = new Set<string>(JSON.parse(readFileSync('public/studio/palette-endesga32.json', 'utf8')).colors.map((c: string) => c.toLowerCase()));

/** Share of a species' fish in each region (weight x width). */
function shares(id: string): Record<string, number> {
  const w = BALANCE.regions.list.map((r) => biomeWeight(id, r.id) * (r.to - r.from));
  const t = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(BALANCE.regions.list.map((r, i) => [r.id, w[i] / t]));
}

describe('new creatures (Nov 22)', () => {
  const NEW = { archerfish: 1, polar_cod: 1, bull_shark: 16, leopard_seal: 19, anglerfish: 21, great_white: 25, sperm_whale: 30 };
  it('each has a valid Endesga 32 pixel look, a population and its unlock level', () => {
    for (const [id, lv] of Object.entries(NEW)) {
      const sp = SPECIES[id];
      expect(seeds, id).toContain(sp.look);
      const proj = JSON.parse(readFileSync(`public/studio/seeds/${sp.look}.json`, 'utf8')) as StudioProject;
      expect(validateProject(proj), id).toEqual([]);
      for (const c of proj.palette) expect(palette.has(c.toLowerCase()), `${id} ${c}`).toBe(true);
      expect(pop[id], id).toBeGreaterThan(0);
      expect(sp.unlockLevel ?? 1, id).toBe(lv);
      if (lv > 1) expect(sp.intro, id).toBeTruthy();
    }
  });
  it('prey of the swamp and the ice are small enough for hatchlings to swallow', () => {
    for (const id of ['archerfish', 'polar_cod']) {
      expect(SPECIES[id].tier).toBe(1);
      expect(player(1).size * STAGES[0].devourRatio, id).toBeGreaterThanOrEqual(ai(id, 1).size * 0.9);
    }
  });
  it('each hunter is a danger when it arrives and stops biting later', () => {
    expect(bites('bull_shark', 16) && !bites('bull_shark', 24)).toBe(true);
    expect(bites('leopard_seal', 19) && !bites('leopard_seal', 26)).toBe(true);
    expect(bites('anglerfish', 21) && !bites('anglerfish', 30)).toBe(true);
    expect(bites('great_white', 25) && !bites('great_white', 32)).toBe(true);
    expect(bites('sperm_whale', 30) && !bites('sperm_whale', 50)).toBe(true);
  });
  it('the anglerfish lives in the Deep (adults only) and has a glowing lure', () => {
    expect(SPECIES.anglerfish.spawn.depthMin).toBeGreaterThanOrEqual(STAGES[1].maxDepth);
    expect(SPECIES.anglerfish.lure).toHaveLength(2);
    expect(SPECIES.anglerfish.behavior.ambush).toBe(true);
  });
  it('the sperm whale is the biggest creature, armored and mostly calm', () => {
    const big = Object.values(SPECIES).filter((s) => s.id !== 'sperm_whale').map((s) => s.baseSize);
    expect(SPECIES.sperm_whale.baseSize).toBeGreaterThan(Math.max(...big));
    expect(SPECIES.sperm_whale.armor).toBeGreaterThan(0);
    expect(SPECIES.sperm_whale.behavior.aggression).toBeLessThan(0.5);
  });
});

describe('each region has its own fish', () => {
  it('tropical reef fish live in the Coral Sea, not the ice', () => {
    for (const id of ['blue_tang', 'lionfish', 'moray_eel']) {
      expect(shares(id).coral, id).toBeGreaterThan(0.8);
      expect(shares(id).ice, id).toBe(0);
    }
  });
  it('the swamp belongs to archerfish and bull sharks, the ice to cod, seals and whales', () => {
    expect(shares('archerfish').swamp).toBe(1);
    expect(shares('bull_shark').swamp).toBeGreaterThan(0.6);
    expect(shares('polar_cod').ice).toBe(1);
    expect(shares('leopard_seal').ice).toBe(1);
    expect(shares('sperm_whale').ice).toBeGreaterThan(0.6);
  });
  it('every region has prey for a hatchling from the start', () => {
    for (const r of BALANCE.regions.list) {
      const prey = Object.keys(pop).filter((id) => SPECIES[id].tier === 1 && (SPECIES[id].unlockLevel ?? 1) === 1);
      const n = prey.reduce((s, id) => s + pop[id] * shares(id)[r.id], 0);
      expect(n, r.id).toBeGreaterThan(10);
    }
  });
  it('every species weight is listed for every region', () => {
    const b = (BALANCE as unknown as { biomes: Record<string, Record<string, number>> }).biomes;
    for (const id of Object.keys(pop)) for (const r of BALANCE.regions.list) expect(typeof b[id]?.[r.id], `${id} ${r.id}`).toBe('number');
  });
  it('pickHomeX picks regions by weight x width and stays put where it is happy', () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts: Record<string, number> = { coral: 0, swamp: 0, ice: 0 };
    for (let i = 0; i < 4000; i++) counts[regions.at(pickHomeX(regions, (r) => biomeWeight('bull_shark', r), undefined, 1500, rand)!).id]++;
    expect(counts.ice).toBe(0);
    expect(counts.swamp / 4000).toBeCloseTo(shares('bull_shark').swamp, 1);
    // a cod in the ice wanders nearby; a cod that drifted into the coral heads back to the ice
    expect(Math.abs(pickHomeX(regions, (r) => biomeWeight('polar_cod', r), 15000, 1500, rand)! - 15000)).toBeLessThanOrEqual(1500);
    for (let i = 0; i < 50; i++) expect(regions.at(pickHomeX(regions, (r) => biomeWeight('polar_cod', r), 3000, 1500, rand)!).id).toBe('ice');
    expect(pickHomeX(regions, () => 0)).toBeNull();
  });
});
