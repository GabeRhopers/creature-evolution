import { describe, expect, it } from 'vitest';
import { playerTwist, twistFor } from '../src/systems/regionTwists';

describe('region twists', () => {
  it('the Coral Sea and unknown regions change nothing', () => {
    for (const id of ['coral', 'nowhere', undefined]) {
      const t = twistFor(id);
      expect([t.vision, t.food, t.hunger, t.speed, t.ventHeal]).toEqual([1, 1, 1, 1, 1]);
    }
  });
  it('the Swamp is murky with more food', () => {
    const t = twistFor('swamp');
    expect(t.vision).toBeLessThan(1);
    expect(t.food).toBeGreaterThan(1);
    expect(t.hint).not.toBe('');
  });
  it('the Volcanic Rift makes you hungry and its vents heal more', () => {
    const t = twistFor('volcano');
    expect(t.hunger).toBeGreaterThan(1);
    expect(t.ventHeal).toBeGreaterThan(1);
  });
  it('the Frozen Sea is slow and hungry, and a warm vent cancels the cold', () => {
    const t = twistFor('ice');
    expect(t.speed).toBeLessThan(1);
    expect(t.hunger).toBeGreaterThan(1);
    expect(playerTwist(t, false)).toEqual({ hunger: t.hunger, speed: t.speed });
    expect(playerTwist(t, true)).toEqual({ hunger: 1, speed: 1 });
    // In the Rift a vent heals but does not cancel the heat.
    expect(playerTwist(twistFor('volcano'), true).hunger).toBeGreaterThan(1);
  });
  it('fields left out default to 1', () => {
    const t = twistFor('x', { x: { vision: 0.5 } });
    expect(t.vision).toBe(0.5);
    expect(t.hunger).toBe(1);
  });
});
