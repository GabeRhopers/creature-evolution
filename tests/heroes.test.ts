import { afterEach, describe, expect, it } from 'vitest';
import { BALANCE, DEFAULT_HERO, HEROES, SPECIES, STAGES, getHero, heroStages, isHero, setHero } from '../src/data';
import { stageAt } from '../src/systems/growth';

afterEach(() => setHero(DEFAULT_HERO));

describe('heroes', () => {
  it('offers the crocodile and Mosa, each with a species', () => {
    expect(HEROES.map((h) => h.id)).toEqual(['crocodile', 'mosa']);
    for (const h of HEROES) expect(SPECIES[h.id], h.id).toBeDefined();
    expect(DEFAULT_HERO).toBe('crocodile');
    expect(isHero('mosa')).toBe(true);
    expect(isHero('grey_shark')).toBe(false);
  });
  it('Mosa never spawns as a reef fish', () => {
    expect(Object.keys(BALANCE.population)).not.toContain('mosa');
  });
  it('Mosa shares the stage levels and depths but has its own designs and abilities', () => {
    const croc = heroStages('crocodile');
    const mosa = heroStages('mosa');
    expect(mosa.map((s) => [s.id, s.from, s.to, s.maxDepth])).toEqual(croc.map((s) => [s.id, s.from, s.to, s.maxDepth]));
    expect(mosa.map((s) => s.skin)).toEqual(['mosa-hatchling', 'mosa-juvenile', 'mosa-adult']);
    expect(mosa.map((s) => s.ability)).toEqual(['dart', 'slam', 'crush']);
    expect(croc.map((s) => s.ability)).toEqual(['shell', 'lunge', 'roll']);
    for (const s of mosa) expect(BALANCE.abilities[s.ability], s.ability).toBeDefined();
  });
  it('setHero swaps the stages the growth code reads', () => {
    setHero('mosa');
    expect(getHero()).toBe('mosa');
    expect(stageAt(25).skin).toBe('mosa-adult');
    expect(STAGES[0].ability).toBe('dart');
    setHero('nobody');
    expect(getHero()).toBe('crocodile');
    expect(stageAt(25).skin).toBe('croc-adult');
  });
  it('Mosa is faster but less armored than the crocodile', () => {
    expect(SPECIES.mosa.maxSpeed).toBeGreaterThan(SPECIES.crocodile.maxSpeed);
    expect(SPECIES.mosa.armor ?? 0).toBeLessThan(SPECIES.crocodile.armor ?? 0);
  });
});
