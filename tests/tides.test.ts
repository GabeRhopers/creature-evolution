import { describe, expect, it } from 'vitest';
import { aiLevelBonus, legendLevel, tideName, tideOf } from '../src/data';
import { perksEarned, perksOwed } from '../src/systems/perks';
import { xpToNext } from '../src/systems/growth';

describe('tides: endless levels in chapters of 10', () => {
  it('levels 1 to 10 are Tide 1, 11 to 20 Tide 2, and so on without end', () => {
    expect([1, 10, 11, 20, 21, 30, 31, 99, 100, 101].map(tideOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 10, 10, 11]);
  });
  it('themes run in order, then come back as harder "+" versions', () => {
    expect(tideName(1)).toBe('Sunny Reef');
    expect(tideName(2)).toBe('Kelp Forest');
    expect(tideName(7)).toBe('Midnight Zone');
    expect(tideName(8)).toBe('Sunny Reef+');
    expect(tideName(15)).toBe('Sunny Reef++');
  });
  it('Legend levels start after the adult stage', () => {
    expect(legendLevel(30)).toBe(0);
    expect(legendLevel(31)).toBe(1);
    expect(legendLevel(45)).toBe(15);
  });
  it('reef fish spawn a little higher each Tide, up to a limit', () => {
    expect(aiLevelBonus(5)).toBe(0);
    expect(aiLevelBonus(15)).toBe(1);
    expect(aiLevelBonus(35)).toBe(3);
    expect(aiLevelBonus(500)).toBe(8);
  });
  it('perks keep coming in Legend levels: one every 3 levels', () => {
    expect(perksEarned(30)).toBe(6);
    expect(perksEarned(32)).toBe(6);
    expect(perksEarned(33)).toBe(7);
    expect(perksEarned(60)).toBe(16);
    expect(perksOwed(36, 7)).toBe(1);
  });
  it('the XP needed keeps rising smoothly far past level 30', () => {
    for (let lv = 30; lv < 150; lv++) {
      expect(xpToNext(lv + 1)).toBeGreaterThan(xpToNext(lv));
      expect(Number.isFinite(xpToNext(lv))).toBe(true);
    }
    // ...but stays reachable: level 100 needs well under 10x what level 40 needs
    expect(xpToNext(100) / xpToNext(40)).toBeLessThan(5);
  });
});
