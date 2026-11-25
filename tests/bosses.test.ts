import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import balance from '../src/data/balance.json';
import { SPECIES, STAGES } from '../src/data';
import { Terrain, type TerrainConfig } from '../src/systems/terrain';
import { beatenFromSave, bossPhase, farFromCave, inChamber, nearerSide, shockMul, type ArenaConfig, type BossDef } from '../src/systems/bosses';
import { validateProject, type StudioProject } from '../src/skins';

const W = balance.world.width;
const surfaceY = balance.world.surfaceY;
const seabedTop = balance.world.height - balance.world.seabedDepth;
const t = new Terrain(balance.terrain as TerrainConfig, W, surfaceY, seabedTop);
const waterH = seabedTop - surfaceY;
const bosses = balance.bosses.list as unknown as BossDef[];
const eel = bosses.find((b) => b.id === 'electric_eel')!;

describe('first boss: the Electric Eel in the Coral Cave (its own arena, Nov 25)', () => {
  it('waits in a cave in the Coral Sea from the middle of the juvenile stage', () => {
    const coral = balance.regions.list.find((r) => r.id === 'coral')!;
    expect(eel.left).toBeGreaterThan(coral.from);
    expect(eel.right).toBeLessThan(coral.to);
    expect(eel.cave).toBe('Coral Cave');
    const juvenile = STAGES.find((s) => s.id === 'juvenile')!;
    expect(eel.level).toBeGreaterThan(juvenile.from);
    expect(eel.level).toBeLessThan(juvenile.to);
  });
  it('the cave has a roof, a floor a juvenile can reach, and an open air hole', () => {
    const juvenileFloor = surfaceY + waterH * STAGES.find((s) => s.id === 'juvenile')!.maxDepth;
    for (let x = eel.left + 300; x < eel.right - 300; x += 100) {
      if (Math.abs(x - eel.airX) < 200) continue;
      const roof = t.ceilAt(x), floor = t.groundAt(x);
      expect(isFinite(roof), `roof at ${x}`).toBe(true);
      expect(floor - roof, `room at ${x}`).toBeGreaterThan(600);
      expect(floor, `floor at ${x}`).toBeLessThan(juvenileFloor + 120);
    }
    expect(isFinite(t.ceilAt(eel.airX))).toBe(false);
  });
  it('has a look, telegraphs its shock and gives a breathing window', () => {
    const sp = SPECIES[eel.species];
    expect(readdirSync('public/studio/seeds').map((f) => f.replace('.json', ''))).toContain(sp.look);
    const proj = JSON.parse(readFileSync(`public/studio/seeds/${sp.look}.json`, 'utf8')) as StudioProject;
    expect(validateProject(proj)).toEqual([]);
    expect(proj.poses.map((p) => p.name)).toContain('celebrate'); // the crackling frames
    expect(eel.shock.telegraph).toBeGreaterThanOrEqual(0.8);
    expect(eel.breath.gulp).toBeGreaterThanOrEqual(3);
    expect(eel.breath.damageMul).toBeGreaterThan(1);
    expect(sp.intro).toBeTruthy();
  });
  it('phase 2 below half health', () => {
    expect(bossPhase(0.8, eel)).toBe(1);
    expect(bossPhase(0.4, eel)).toBe(2);
  });
  it('the arena: inside = between the cave sides and under the surface; the nearer mouth; asking again after swimming away', () => {
    const mid = (eel.left + eel.right) / 2;
    expect(inChamber(mid, surfaceY + 300, eel, surfaceY)).toBe(true);
    expect(inChamber(mid, surfaceY - 50, eel, surfaceY)).toBe(false); // on top of the rock, out of the water
    expect(inChamber(eel.left - 10, surfaceY + 300, eel, surfaceY)).toBe(false);
    expect(nearerSide(eel.left + 100, eel)).toBe('left');
    expect(nearerSide(eel.right - 100, eel)).toBe('right');
    const A = balance.bosses.arena as ArenaConfig;
    expect(farFromCave(eel.left - A.outsideGap, eel, A.askAgainDistance)).toBe(false);
    expect(farFromCave(eel.left - A.askAgainDistance - 1, eel, A.askAgainDistance)).toBe(true);
    expect(A.lossHpFraction).toBeGreaterThan(0);
    expect(A.lossHpFraction).toBeLessThan(1);
  });
  it('the cave mouths open to water outside, where you are put back out', () => {
    const A = balance.bosses.arena as ArenaConfig;
    for (const x of [eel.left - A.outsideGap, eel.right + A.outsideGap]) {
      const top = isFinite(t.ceilAt(x)) ? Math.max(surfaceY, t.ceilAt(x)) : surfaceY;
      expect(t.groundAt(x) - top, `open water at ${x}`).toBeGreaterThan(300);
    }
  });
  it('the old Spring Cave in the swamp is gone', () => {
    const swampCave = (balance.terrain.islands as Array<{ x: number; style?: string }>).filter((i) => i.style === 'cave' && i.x > 24000 && i.x < 38000);
    expect(swampCave).toEqual([]);
  });
  it('beaten bosses are saved, and their trophies soften shocks', () => {
    expect(beatenFromSave(undefined, bosses)).toEqual([]);
    expect(beatenFromSave(['electric_eel', 'nope'], bosses)).toEqual(['electric_eel']);
    expect(shockMul([], bosses)).toBe(1);
    expect(shockMul(['electric_eel'], bosses)).toBeCloseTo(eel.trophyShockMul);
  });
});
