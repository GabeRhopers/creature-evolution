import { describe, expect, it } from 'vitest';
import { BALANCE, SPECIES } from '../src/data';
import { countInTide, factorsFor, groupSizes, outShare, rollLevel, waveOn } from '../src/systems/spawnFactors';

let seed = 3;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pop = BALANCE.population as Record<string, number>;

describe('enemy spawn factors (Nov 23)', () => {
  it('every enemy has every factor, in a sensible range', () => {
    for (const id of Object.keys(pop)) {
      expect(SPECIES[id], id).toBeTruthy();
      const f = factorsFor(id);
      for (const p of ['dawn', 'day', 'dusk', 'night'] as const) expect(f.activity[p], `${id} ${p}`).toBeGreaterThanOrEqual(0);
      expect(f.groupMax, id).toBeGreaterThanOrEqual(f.groupMin);
      expect(f.levelMax, id).toBeGreaterThanOrEqual(f.levelMin);
      expect(f.eliteChance, id).toBeLessThanOrEqual(0.5);
      expect(f.waveStay, id).toBeLessThanOrEqual(f.waveEvery || Infinity);
    }
  });
  it('own values win over the defaults; the rest come from the defaults', () => {
    const a = factorsFor('anglerfish');
    expect(a.activity.night).toBe(1);
    expect(a.activity.day).toBeLessThan(1);
    expect(a.levelMin).toBe(BALANCE.spawnDefaults.levelMin);
  });
  it('time of day, waves and a last level decide how many are out', () => {
    const f = { ...factorsFor('barracuda'), activity: { dawn: 1, day: 0.5, dusk: 1, night: 0.25 } };
    expect(outShare(f, 'day', 0, 30)).toBe(0.5);
    expect(waveOn(f, 10)).toBe(true);
    expect(waveOn(f, f.waveStay + 1)).toBe(false);
    expect(outShare(f, 'dawn', f.waveStay + 1, 30)).toBe(0);
    expect(outShare({ ...f, waveEvery: 0, lastLevel: 20 }, 'dawn', 0, 21)).toBe(0);
    expect(outShare({ ...f, waveEvery: 0, lastLevel: 20 }, 'dawn', 0, 20)).toBe(1);
  });
  it('counts grow each Tide by perTide', () => {
    const f = { ...factorsFor('grey_shark'), perTide: 0.1 };
    expect(countInTide(10, f, 1)).toBe(10);
    expect(countInTide(10, f, 3)).toBeCloseTo(12);
  });
  it('groups add up to the count, each within min and max (the last may be smaller)', () => {
    const f = { ...factorsFor('blue_tang'), groupMin: 4, groupMax: 8 };
    const g = groupSizes(50, f, rand);
    expect(g.reduce((a, b) => a + b, 0)).toBe(50);
    expect(g.slice(0, -1).every((n) => n >= 4 && n <= 8)).toBe(true);
  });
  it('levels spread between levelMin and levelMax; elites are rarer and stronger', () => {
    const f = { ...factorsFor('red_grouper'), levelMin: 2, levelMax: 5, eliteChance: 0.2, eliteLevels: 4 };
    let elites = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollLevel(f, 1, rand);
      if (r.elite) { elites++; expect(r.level).toBeGreaterThanOrEqual(2 + 1 + 4); }
      else { expect(r.level).toBeGreaterThanOrEqual(3); expect(r.level).toBeLessThanOrEqual(6); }
    }
    expect(elites / 2000).toBeGreaterThan(0.15);
    expect(elites / 2000).toBeLessThan(0.25);
  });
});
