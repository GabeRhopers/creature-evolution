import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { canVisit, heroPulled, hookCatches, hookDamage, hookDepth, nextVisit, type FisherConfig } from '../src/systems/fisher';

const cfg = (BALANCE as unknown as { fisher: FisherConfig }).fisher;

describe('the Fisher Ape', () => {
  it('visits now and then, only by day in the shallow regions, never in a boss cave', () => {
    expect(nextVisit(cfg, 0)).toBe(cfg.everyMin);
    expect(nextVisit(cfg, 1)).toBe(cfg.everyMax);
    expect(canVisit(cfg, 'coral', 'day', false)).toBe(true);
    expect(canVisit(cfg, 'swamp', 'day', false)).toBe(true);
    expect(canVisit(cfg, 'coral', 'night', false)).toBe(false);
    expect(canVisit(cfg, 'trench', 'day', false)).toBe(false);
    expect(canVisit(cfg, 'coral', 'day', true)).toBe(false);
  });
  it('catches small fish only', () => {
    expect(hookCatches(cfg, cfg.catchMaxSize)).toBe(true);
    expect(hookCatches(cfg, cfg.catchMaxSize + 1)).toBe(false);
  });
  it('pulls hatchlings and juveniles, not adults', () => {
    expect(heroPulled(cfg, 'hatchling')).toBe(true);
    expect(heroPulled(cfg, 'juvenile')).toBe(true);
    expect(heroPulled(cfg, 'adult')).toBe(false);
    expect(heroPulled(cfg, undefined)).toBe(false);
  });
  it('drops the hook into the shallow water', () => {
    const top = BALANCE.world.surfaceY, bed = BALANCE.world.height - BALANCE.world.seabedDepth;
    for (const r of [0, 0.5, 1]) {
      const y = hookDepth(cfg, top, bed, r);
      expect(y).toBeGreaterThan(top);
      expect((y - top) / (bed - top)).toBeLessThanOrEqual(cfg.hookDepthMax + 1e-9);
    }
  });
  it('the hook hurts but never kills', () => {
    expect(hookDamage(cfg, 100, 100)).toBeCloseTo(100 * cfg.hookDamageFraction);
    expect(hookDamage(cfg, 5, 100)).toBe(4);
    expect(hookDamage(cfg, 1, 100)).toBe(0);
  });
});
