import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { xpToNext } from '../src/systems/growth';

const plain = (lv: number) => BALANCE.growth.xpBase * Math.pow(lv, BALANCE.growth.xpExponent);

describe('level curve: a little harder every level', () => {
  it('level 1 is unchanged; later levels need more than the plain curve', () => {
    expect(xpToNext(1)).toBe(Math.round(plain(1)));
    expect(xpToNext(10) / plain(10)).toBeGreaterThan(1.25);
    expect(xpToNext(10) / plain(10)).toBeLessThan(1.35);
    expect(xpToNext(30) / plain(30)).toBeGreaterThan(2.2);
    expect(xpToNext(30) / plain(30)).toBeLessThan(2.5);
  });
  it('every level needs more than the one before, with no sudden jumps', () => {
    for (let lv = 1; lv < 60; lv++) {
      const ratio = xpToNext(lv + 1) / xpToNext(lv);
      expect(ratio, `level ${lv}`).toBeGreaterThan(1);
      expect(ratio, `level ${lv}`).toBeLessThan(lv < 5 ? 3.0 : 1.6); // the base curve itself is steep at first
    }
  });
});
