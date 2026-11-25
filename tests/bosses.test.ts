import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import balance from '../src/data/balance.json';
import { SPECIES, STAGES } from '../src/data';
import { Terrain, type TerrainConfig } from '../src/systems/terrain';
import { arenaLayout, beatenFromSave, bossPhase, clampToBox, inBox, shockMul, type ArenaConfig, type BossDef } from '../src/systems/bosses';
import { validateProject, type StudioProject } from '../src/skins';

const W = balance.world.width;
const surfaceY = balance.world.surfaceY;
const seabedTop = balance.world.height - balance.world.seabedDepth;
const t = new Terrain(balance.terrain as TerrainConfig, W, surfaceY, seabedTop);
const waterH = seabedTop - surfaceY;
const bosses = balance.bosses.list as unknown as BossDef[];
const eel = bosses.find((b) => b.id === 'electric_eel')!;

describe('first boss: the Electric Eel in the Coral Cave (its own arena screen, Nov 25)', () => {
  const A = balance.bosses.arena as ArenaConfig;
  const L = arenaLayout(eel, A, balance.world.height);
  it('the cave entrance sits in the Coral Sea, on ground a mid-juvenile can reach', () => {
    const coral = balance.regions.list.find((r) => r.id === 'coral')!;
    expect(eel.entranceX).toBeGreaterThan(coral.from);
    expect(eel.entranceX).toBeLessThan(coral.to);
    expect(eel.cave).toBe('Coral Cave');
    const juvenile = STAGES.find((s) => s.id === 'juvenile')!;
    expect(eel.level).toBeGreaterThan(juvenile.from);
    expect(eel.level).toBeLessThan(juvenile.to);
    const juvenileFloor = surfaceY + waterH * juvenile.maxDepth;
    expect(t.groundAt(eel.entranceX) - 50).toBeLessThan(juvenileFloor);
    expect(isFinite(t.ceilAt(eel.entranceX))).toBe(false); // open water above it
  });
  it('the arena is a separate place below the world, with an EXIT on the left and an air pocket on top', () => {
    expect(L.outer.y).toBeGreaterThan(balance.world.height);
    expect(L.inner.x).toBeGreaterThan(L.outer.x);
    expect(L.inner.x + L.inner.w).toBeLessThan(L.outer.x + L.outer.w);
    expect(L.inner.y + L.inner.h).toBeLessThan(L.outer.y + L.outer.h);
    expect(inBox(L.exit.x + 5, L.exit.y + L.exit.h / 2, L.inner)).toBe(true);
    expect(L.exit.x).toBe(L.inner.x);
    expect(inBox(L.start.x, L.start.y, L.inner) && !inBox(L.start.x, L.start.y, L.exit)).toBe(true); // you appear just past the exit
    expect(L.air.x).toBeGreaterThan(L.inner.x);
    expect(L.air.x).toBeLessThan(L.inner.x + L.inner.w);
    expect(L.boss.x).toBeGreaterThan(L.start.x);
    expect(L.inner.h).toBeGreaterThan(700);
  });
  it('swimmers are kept inside the open water', () => {
    expect(clampToBox(L.inner.x - 100, L.inner.y + 10, 20, L.inner)).toEqual({ x: L.inner.x + 20, y: L.inner.y + 20 });
    const mid = { x: L.inner.x + 500, y: L.inner.y + 300 };
    expect(clampToBox(mid.x, mid.y, 20, L.inner)).toEqual(mid);
  });
  it('the Coral Sea is back to normal and the old Spring Cave is gone', () => {
    const caves = (balance.terrain.islands as Array<{ x: number; style?: string }>).filter((i) => i.style === 'cave' && i.x < 72000);
    expect(caves).toEqual([]);
  });
  it('phase 2 below half health', () => {
    expect(bossPhase(0.8, eel)).toBe(1);
    expect(bossPhase(0.4, eel)).toBe(2);
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
  it('beaten bosses are saved, and their trophies soften shocks', () => {
    expect(beatenFromSave(undefined, bosses)).toEqual([]);
    expect(beatenFromSave(['electric_eel', 'nope'], bosses)).toEqual(['electric_eel']);
    expect(shockMul([], bosses)).toBe(1);
    expect(shockMul(['electric_eel'], bosses)).toBeCloseTo(eel.trophyShockMul);
  });
});
