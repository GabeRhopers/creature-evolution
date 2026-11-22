import { describe, expect, it } from 'vitest';
import balance from '../src/data/balance.json';
import { DayNight, PERIODS, type DayNightConfig } from '../src/systems/dayNight';

const cfg = balance.dayNight as unknown as DayNightConfig;
const dn = new DayNight(cfg);

describe('day and night', () => {
  it('has four periods in order, and the cycle is their total length', () => {
    expect(PERIODS).toEqual(['dawn', 'day', 'dusk', 'night']);
    expect(dn.length).toBe(Object.values(cfg.seconds).reduce((a, b) => a + b, 0));
    let t = 0;
    for (const p of PERIODS) {
      expect(dn.periodAt(t + 1)).toBe(p);
      t += cfg.seconds[p];
    }
    expect(dn.periodAt(dn.length + 1)).toBe('dawn'); // it loops
  });

  it('holds each period look in its middle', () => {
    for (const p of PERIODS) {
      const mid = dn.startOf(p) + cfg.seconds[p] / 2;
      const L = dn.lightAt(mid);
      expect(L.dark).toBeCloseTo(cfg.periods[p].dark, 5);
      expect(L.sky).toBe(parseInt(cfg.periods[p].sky.slice(1), 16));
    }
  });

  it('changes smoothly: no jumps between frames, even across period changes', () => {
    const keys = ['dark', 'tintAlpha', 'rays', 'stars', 'glow', 'preyVision', 'predatorVision', 'plankton'] as const;
    let prev = dn.lightAt(0);
    for (let t = 0.1; t < dn.length * 2; t += 0.1) {
      const L = dn.lightAt(t);
      for (const k of keys) expect(Math.abs(L[k] - prev[k]), `${k} at ${t.toFixed(1)}`).toBeLessThan(0.02);
      prev = L;
    }
  });

  it('night is dark with stars and glowing plankton; day is bright', () => {
    const night = dn.lightAt(dn.startOf('night') + cfg.seconds.night / 2);
    const day = dn.lightAt(dn.startOf('day') + cfg.seconds.day / 2);
    expect(night.dark).toBeGreaterThan(0.4);
    expect(night.stars).toBe(1);
    expect(night.glow).toBe(1);
    expect(night.preyVision).toBeLessThan(day.preyVision);
    expect(night.plankton).toBeGreaterThan(day.plankton);
    expect(day.dark).toBe(0);
  });

  it('dawn and dusk are the hunting hours', () => {
    for (const p of ['dawn', 'dusk'] as const) {
      const L = dn.lightAt(dn.startOf(p) + cfg.seconds[p] / 2);
      expect(L.predatorHunger).toBeGreaterThan(1);
      expect(L.predatorVision).toBeGreaterThan(1);
    }
  });
});
