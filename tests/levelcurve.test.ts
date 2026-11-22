import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { xpToNext } from '../src/systems/growth';

const plain = (lv: number) => BALANCE.growth.xpBase * Math.pow(lv, BALANCE.growth.xpExponent);

describe('level curve: a little harder every level', () => {
  it('level 1 is unchanged; later levels need more than the plain curve', () => {
    expect(xpToNext(1)).toBe(Math.round(plain(1)));
    expect(xpToNext(10) / plain(10)).toBeGreaterThan(1.25);
    expect(xpToNext(10) / plain(10)).toBeLessThan(1.35);
  });
  it('from level 13 to the cap, each level needs at least 15% more XP than the one before', () => {
    const step = 1 + BALANCE.growth.levelStepMin;
    for (let lv = 13; lv < BALANCE.growth.levelHardnessMaxLevels; lv++) {
      expect(xpToNext(lv + 1) / xpToNext(lv), `level ${lv}`).toBeGreaterThanOrEqual(step - 0.002);
    }
  });
  it('after the cap, levels still get harder but only a little (endless levels stay reachable)', () => {
    const cap = BALANCE.growth.levelHardnessMaxLevels;
    for (let lv = cap; lv < cap + 60; lv++) {
      const r = xpToNext(lv + 1) / xpToNext(lv);
      expect(r).toBeGreaterThan(1);
      expect(r).toBeLessThan(1.1);
    }
  });
  it('every level needs more than the one before, with no sudden jumps', () => {
    for (let lv = 1; lv < 60; lv++) {
      const ratio = xpToNext(lv + 1) / xpToNext(lv);
      expect(ratio, `level ${lv}`).toBeGreaterThan(1);
      expect(ratio, `level ${lv}`).toBeLessThan(lv < 5 ? 3.0 : 1.6); // the base curve itself is steep at first
    }
  });
});
