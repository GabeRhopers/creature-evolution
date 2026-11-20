import { describe, expect, it } from 'vitest';
import { Stomach } from '../src/systems/Stomach';
import { BALANCE, SPECIES } from '../src/data';
import { sizeAt } from '../src/systems/growth';

describe('stomach', () => {
  it('pays about a third now and banks the rest', () => {
    const s = new Stomach();
    s.reset(1);
    const now = s.eat(9);
    expect(now).toBeCloseTo(9 * BALANCE.stomach.immediateXpFraction);
    expect(s.bank).toBeCloseTo(9 - now);
  });
  it('digests after resting when full enough', () => {
    const s = new Stomach();
    s.reset(1);
    s.fill = s.capacity * 0.9;
    s.bank = 20;
    let released = 0;
    for (let t = 0; t < BALANCE.stomach.restSeconds + 0.5; t += 0.1) released += s.update(0.1, true).released;
    expect(released).toBeGreaterThanOrEqual(20 * 0.9);
    expect(s.ratio).toBeLessThan(0.6);
  });
  it('capacity grows with level', () => {
    const s = new Stomach();
    s.reset(1);
    const c1 = s.capacity;
    s.setLevel(10);
    expect(s.capacity).toBeGreaterThan(c1);
  });
});

describe('growth', () => {
  it('a level 1 crocodile can swallow a blue tang', () => {
    const croc = SPECIES[BALANCE.playerSpecies];
    expect(sizeAt(croc, 1) * croc.devourRatio).toBeGreaterThanOrEqual(SPECIES.blue_tang.baseSize);
  });
  it('size never shrinks with level', () => {
    const croc = SPECIES[BALANCE.playerSpecies];
    for (let lv = 1; lv < 60; lv++) expect(sizeAt(croc, lv + 1)).toBeGreaterThanOrEqual(sizeAt(croc, lv));
  });
});
