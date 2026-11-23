import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { BALANCE, SPECIES, biomeWeight } from '../src/data';
import { formAt } from '../src/systems/growth';
import { validateProject, type StudioProject } from '../src/skins';

const player = (level: number) => formAt(SPECIES.crocodile, level, true);
const ai = (id: string) => formAt(SPECIES[id], 1, false);
const bites = (id: string, lv: number) => player(lv).rank <= ai(id).rank * BALANCE.combat.aiBiteMaxSizeRatio;
const seeds = readdirSync('public/studio/seeds').map((f) => f.replace('.json', ''));
const palette = new Set<string>(JSON.parse(readFileSync('public/studio/palette-endesga32.json', 'utf8')).colors.map((c: string) => c.toLowerCase()));
const pop = BALANCE.population as Record<string, number>;
const NEW = { lanternfish: 40, viperfish: 41, vampire_squid: 42, gulper_eel: 44 };

describe('Twilight Trench creatures (Nov 23)', () => {
  it('each has a valid Endesga 32 look, a population, an unlock level in Tide 5 and an intro', () => {
    for (const [id, lv] of Object.entries(NEW)) {
      const sp = SPECIES[id];
      expect(seeds, id).toContain(sp.look);
      const proj = JSON.parse(readFileSync(`public/studio/seeds/${sp.look}.json`, 'utf8')) as StudioProject;
      expect(validateProject(proj), id).toEqual([]);
      for (const c of proj.palette) expect(palette.has(c.toLowerCase()), `${id} ${c}`).toBe(true);
      expect(pop[id], id).toBeGreaterThan(0);
      expect(sp.unlockLevel, id).toBe(lv);
      expect(sp.intro, id).toBeTruthy();
    }
  });
  it('live only in the Twilight Trench', () => {
    for (const id of Object.keys(NEW))
      for (const r of BALANCE.regions.list) expect(biomeWeight(id, r.id), `${id} ${r.id}`).toBe(r.id === 'trench' ? 1 : 0);
  });
  it('glow in the dark with palette colors', () => {
    for (const id of ['lanternfish', 'viperfish', 'vampire_squid']) expect(palette.has(SPECIES[id].glow!.toLowerCase()), id).toBe(true);
    expect(SPECIES.viperfish.lure).toHaveLength(2);
  });
  it('the hunters are a danger when they arrive and stop biting later', () => {
    expect(bites('viperfish', 41) && !bites('viperfish', 50)).toBe(true);
    expect(bites('gulper_eel', 44) && !bites('gulper_eel', 56)).toBe(true);
    expect(SPECIES.gulper_eel.devourRatio).toBeGreaterThanOrEqual(1);
  });
  it('lanternfish are food and the vampire squid is harmless but blinds you', () => {
    expect(SPECIES.lanternfish.tier).toBe(1);
    expect(SPECIES.lanternfish.behavior.schooling).toBe(true);
    expect(SPECIES.vampire_squid.behavior.aggression).toBe(0);
    expect(SPECIES.vampire_squid.cloud).toBeGreaterThan(0);
    expect(BALANCE.trench.cloudCooldown).toBeGreaterThan(SPECIES.vampire_squid.cloud!);
  });
});
