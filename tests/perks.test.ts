import { describe, expect, it } from 'vitest';
import { PERKS, PERK_LEVELS, offerPerks, perkMods, perksOwed } from '../src/systems/perks';
import { STAGES } from '../src/data';

describe('perks', () => {
  it('are offered twice per stage, never on an evolution level', () => {
    for (const s of STAGES) expect(PERK_LEVELS.filter((l) => l >= s.from && l <= s.to).length).toBe(2);
    for (const s of STAGES) expect(PERK_LEVELS).not.toContain(s.from);
  });
  it('counts picks earned but not made', () => {
    expect(perksOwed(3, 0)).toBe(0);
    expect(perksOwed(4, 0)).toBe(1);
    expect(perksOwed(8, 1)).toBe(1);
    expect(perksOwed(30, 6)).toBe(0);
    expect(perksOwed(30, 9)).toBe(0); // never negative
  });
  it('offers three different perks', () => {
    for (let i = 0; i < 50; i++) {
      const o = offerPerks();
      expect(o.length).toBe(3);
      expect(new Set(o.map((p) => p.id)).size).toBe(3);
    }
  });
  it('stack by multiplying, and unknown ids do nothing', () => {
    const m = perkMods(['swift', 'swift', 'jaws', 'nope']);
    expect(m.speed).toBeCloseTo(1.21);
    expect(m.bite).toBeCloseTo(1.15);
    expect(m.damageTaken).toBe(1);
  });
  it('every perk has a clear name, text, icon and an effect', () => {
    for (const p of PERKS) {
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.desc.length).toBeGreaterThan(8);
      expect(p.icon.length).toBeGreaterThan(0);
      expect(Object.keys(perkMods([p.id])).some((k) => (perkMods([p.id]) as unknown as Record<string, number>)[k] !== 1)).toBe(true);
    }
  });
});

describe('hatchling head start (Nov 23)', async () => {
  const { earlyHelpMods, earlyHelpStrength } = await import('../src/systems/perks');
  const { BALANCE, SPECIES } = await import('../src/data');
  const { formAt } = await import('../src/systems/growth');
  it('is full at the first levels, fades out, and is gone by endsAt', () => {
    const e = BALANCE.earlyHelp;
    expect(earlyHelpStrength(1)).toBe(1);
    expect(earlyHelpStrength(e.fullUntil)).toBe(1);
    expect(earlyHelpStrength(e.endsAt)).toBe(0);
    expect(earlyHelpStrength(30)).toBe(0);
    for (let lv = e.fullUntil; lv < e.endsAt; lv++) expect(earlyHelpStrength(lv + 1)).toBeLessThan(earlyHelpStrength(lv));
    const m = earlyHelpMods(e.endsAt);
    expect([m.speed, m.turn, m.stamina, m.damageTaken]).toEqual([1, 1, 1, 1]);
  });
  it('makes a level 1 hatchling clearly faster than the prey it chases, and quick to turn', () => {
    const h = earlyHelpMods(1);
    for (const hero of ['crocodile', 'mosa', 'white_shark']) {
      const me = SPECIES[hero];
      // A blue tang spawns at levels 1 to 3: compare with the fastest one, both sprinting.
      const tang = SPECIES.blue_tang;
      const tangSize = formAt(tang, 3, false).size;
      const tangSprint = tang.maxSpeed * Math.pow(tangSize / tang.baseSize, BALANCE.growth.speedExponent) * tang.sprintMultiplier;
      const mySprint = me.maxSpeed * h.speed * me.sprintMultiplier;
      expect(mySprint, hero).toBeGreaterThan(tangSprint * 1.15);
      expect(me.turnSpeed * h.turn, hero).toBeGreaterThanOrEqual(tang.turnSpeed * 0.95);
    }
    // a sprint lasts at least 40% longer, bites hurt less
    expect(1 / h.stamina).toBeGreaterThanOrEqual(1.4);
    expect(h.damageTaken).toBeLessThan(1);
  });
});
