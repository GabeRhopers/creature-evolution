import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { BALANCE, SPECIES, STAGES } from '../src/data';
import { formAt } from '../src/systems/growth';

const seeds = readdirSync('public/studio/seeds').map((f) => f.replace('.json', ''));
const croc = SPECIES.crocodile;
const player = (level: number) => formAt(croc, level, true);
/** The strongest an AI fish of this species spawns (levels 1 to 3). */
const ai = (id: string, level = 1) => formAt(SPECIES[id], level, false);
const bites = (id: string, playerLevel: number) => player(playerLevel).rank <= ai(id).rank * BALANCE.combat.aiBiteMaxSizeRatio;

describe('higher-level enemies', () => {
  const NEW = { lionfish: 6, moray_eel: 14, barracuda: 22 };
  it('each one unlocks at its level, has a pixel look and swims in the reef', () => {
    for (const [id, lv] of Object.entries(NEW)) {
      const sp = SPECIES[id];
      expect(sp.unlockLevel, id).toBe(lv);
      expect(seeds, id).toContain(sp.look);
      expect(Object.keys(BALANCE.population), id).toContain(id);
      expect(sp.intro, id).toBeTruthy();
    }
    // the original reef fish are there from the start
    for (const id of ['blue_tang', 'reef_snapper', 'red_grouper', 'grey_shark']) expect(SPECIES[id].unlockLevel ?? 1).toBe(1);
  });
  it('lionfish: venomous, harmless otherwise, and small enough to swallow', () => {
    expect(SPECIES.lionfish.venom).toBeGreaterThan(0);
    expect(SPECIES.lionfish.behavior.aggression).toBe(0);
    expect(player(6).size * STAGES[0].devourRatio).toBeGreaterThanOrEqual(ai('lionfish').size);
  });
  it('moray eel: an ambusher that bites juveniles but not adults', () => {
    expect(SPECIES.moray_eel.behavior.ambush).toBe(true);
    expect(bites('moray_eel', 14)).toBe(true);
    expect(bites('moray_eel', 25)).toBe(false);
  });
  it('barracuda: slim, but strong enough to bite adults (rankMul)', () => {
    expect(ai('barracuda').rank).toBeCloseTo(ai('barracuda').size * (SPECIES.barracuda.rankMul ?? 1));
    expect(bites('barracuda', 22)).toBe(true);
    expect(SPECIES.barracuda.behavior.schooling).toBe(true);
  });
});
