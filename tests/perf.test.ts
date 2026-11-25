import { describe, expect, it } from 'vitest';
import { grade, summarizeFrames } from '../src/ui/perfMeter';

describe('performance meter stats', () => {
  it('a steady 60 fps is smooth', () => {
    const s = summarizeFrames(Array(120).fill(1000 / 60));
    expect(s.fps).toBe(60);
    expect(s.low).toBe(60);
    expect(s.hitches).toBe(0);
    expect(grade(s)).toBe('smooth');
  });
  it('a few long frames show up as stutter even when the average is fine', () => {
    const ms = Array(100).fill(1000 / 60);
    for (let i = 0; i < 6; i++) ms[i * 15] = 80;
    const s = summarizeFrames(ms);
    expect(s.fps).toBeGreaterThan(45);
    expect(s.low).toBeLessThan(20);
    expect(s.worstMs).toBe(80);
    expect(s.hitches).toBe(0.06);
    expect(grade(s)).toBe('choppy');
  });
  it('30 fps is ok only if it never drops much lower', () => {
    expect(grade(summarizeFrames(Array(60).fill(1000 / 45)))).toBe('ok');
    expect(grade(summarizeFrames(Array(60).fill(1000 / 30)))).toBe('choppy');
  });
  it('ignores junk (pauses, zero frames)', () => {
    expect(summarizeFrames([0, 5000, -3])).toEqual({ fps: 0, low: 0, worstMs: 0, hitches: 0 });
  });
});
