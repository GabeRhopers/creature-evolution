import { describe, expect, it } from 'vitest';
import { BALANCE, MAX_LEVEL, SPECIES, STAGES } from '../src/data';
import { clampLevel, formAt, levelToSwallow, sizeAt, stageAt, stageIndex } from '../src/systems/growth';

const croc = SPECIES[BALANCE.playerSpecies];
const f = (lv: number) => formAt(croc, lv, true);

describe('stages', () => {
  it('has three stages covering levels 1 to 30 without gaps (Legend levels go on after)', () => {
    expect(STAGES.map((s) => s.id)).toEqual(['hatchling', 'juvenile', 'adult']);
    expect(STAGES[0].from).toBe(1);
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].from).toBe(STAGES[i - 1].to + 1);
    expect(STAGES[STAGES.length - 1].to).toBe(30);
    expect(stageAt(45).id).toBe('adult');
    expect(stageAt(10).id).toBe('hatchling');
    expect(stageAt(11).id).toBe('juvenile');
    expect(stageAt(21).id).toBe('adult');
  });
  it('levels are endless; past 30 the body stays adult-sized but strength keeps growing', () => {
    expect(MAX_LEVEL).toBeGreaterThanOrEqual(500);
    expect(clampLevel(45)).toBe(45);
    expect(f(45).size).toBe(f(30).size);
    expect(f(31).rank / f(30).rank).toBeCloseTo(1 + BALANCE.tides.legendRankPerLevel);
    expect(f(60).rank).toBeGreaterThan(f(30).rank * 2);
  });
  it('size grows only a little inside a stage, and jumps when evolving', () => {
    for (const s of STAGES) {
      const growth = f(s.to).size / f(s.from).size;
      expect(growth).toBeGreaterThan(1);
      expect(growth).toBeLessThan(1.35);
    }
    expect(f(11).size / f(10).size).toBeGreaterThan(1.3);
    expect(f(21).size / f(20).size).toBeGreaterThan(1.2);
  });
  it('the biggest adult is about 3.7x the hatchling, not 26x like before', () => {
    const ratio = f(30).size / f(1).size;
    expect(ratio).toBeLessThan(4);
    expect(sizeAt(croc, 30) / sizeAt(croc, 1)).toBeGreaterThan(20); // the old formula, for reference
  });
  it('never shrinks when leveling up', () => {
    for (let lv = 1; lv < 120; lv++) {
      expect(f(lv + 1).size).toBeGreaterThanOrEqual(f(lv).size);
      expect(f(lv + 1).rank).toBeGreaterThanOrEqual(f(lv).rank);
    }
  });
  it('AI fish keep the classic formula', () => {
    const tang = SPECIES.blue_tang;
    const a = formAt(tang, 4, false);
    expect(a.size).toBeCloseTo(sizeAt(tang, 4));
    expect(a.rank).toBe(a.size);
    expect(a.stage).toBeNull();
  });
  it('stageIndex changes exactly at evolution levels', () => {
    const changes = [];
    for (let lv = 1; lv < 120; lv++) if (stageIndex(lv + 1) !== stageIndex(lv)) changes.push(lv + 1);
    expect(changes).toEqual([11, 21]);
  });
});

describe('food chain by stage', () => {
  const threat = (predRank: number, lv: number) => predRank >= f(lv).rank * BALANCE.combat.threatSizeRatio;
  it('a hatchling can swallow plankton-sized fish from the start', () => {
    expect(levelToSwallow(SPECIES.blue_tang.baseSize)).toBe(1);
  });
  it('snappers are swallowed as a juvenile, groupers late as an adult, sharks only bitten', () => {
    const snap = levelToSwallow(SPECIES.reef_snapper.baseSize)!;
    expect(stageAt(snap).id).toBe('juvenile');
    const grouper = levelToSwallow(SPECIES.red_grouper.baseSize)!;
    expect(stageAt(grouper).id).toBe('adult');
    expect(levelToSwallow(SPECIES.grey_shark.baseSize)).toBeNull();
  });
  it('sharks hunt hatchlings and juveniles but not adults', () => {
    const shark = SPECIES.grey_shark.baseSize;
    expect(threat(shark, 5)).toBe(true);
    expect(threat(shark, 15)).toBe(true);
    expect(threat(shark, 21)).toBe(false);
  });
  it('sharks start fleeing from a grown adult', () => {
    const shark = SPECIES.grey_shark.baseSize;
    expect(f(30).rank).toBeGreaterThanOrEqual(shark * BALANCE.combat.threatSizeRatio);
  });
});

import { AREAS, areaAt } from '../src/data';
describe('areas', () => {
  it('cover the sea from surface to seabed without gaps', () => {
    expect(AREAS[0].from).toBe(0);
    for (let i = 1; i < AREAS.length; i++) expect(AREAS[i].from).toBe(AREAS[i - 1].to);
    expect(AREAS[AREAS.length - 1].to).toBe(1);
    expect(areaAt(0.1).id).toBe('shallows');
    expect(areaAt(1).id).toBe('deep');
  });
  it('open deeper with each stage, and the adult reaches the seabed', () => {
    for (let i = 1; i < STAGES.length; i++) expect(STAGES[i].maxDepth).toBeGreaterThan(STAGES[i - 1].maxDepth);
    expect(STAGES[STAGES.length - 1].maxDepth).toBe(1);
  });
  it('each stage has food it can swallow inside its own waters', () => {
    for (const s of STAGES) {
      const lvl = s.from;
      const food = Object.values(SPECIES).filter(
        (sp) => sp.spawn.weight > 0 && sp.spawn.depthMin < s.maxDepth && levelToSwallow(sp.baseSize) !== null && levelToSwallow(sp.baseSize)! <= lvl,
      );
      expect(food.length, s.id).toBeGreaterThan(0);
    }
  });
  it('the start depth is open to a hatchling', () => {
    expect(BALANCE.playerStartDepth).toBeLessThan(STAGES[0].maxDepth);
  });
});
