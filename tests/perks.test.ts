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
