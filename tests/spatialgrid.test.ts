import { describe, expect, it } from 'vitest';
import { SpatialGrid } from '../src/systems/spatialGrid';

describe('spatial grid', () => {
  it('finds every item within range (same answer as checking them all)', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = Array.from({ length: 500 }, (_, i) => ({ i, x: (rand() - 0.5) * 20000, y: rand() * 3000 }));
    const g = new SpatialGrid<{ i: number; x: number; y: number }>(400);
    for (const p of pts) g.insert(p, p.x, p.y);
    const out: typeof pts = [];
    for (let q = 0; q < 50; q++) {
      const x = (rand() - 0.5) * 20000, y = rand() * 3000, r = 100 + rand() * 900;
      const near = new Set(g.query(x, y, r, out).filter((p) => Math.hypot(p.x - x, p.y - y) <= r).map((p) => p.i));
      const all = new Set(pts.filter((p) => Math.hypot(p.x - x, p.y - y) <= r).map((p) => p.i));
      expect(near).toEqual(all);
    }
  });
  it('returns far fewer candidates than the whole list', () => {
    const g = new SpatialGrid<number>(400);
    for (let i = 0; i < 1000; i++) g.insert(i, i * 30, (i % 10) * 300);
    expect(g.query(15000, 1500, 500, []).length).toBeLessThan(100);
  });
  it('reuses its buckets after clear (nothing left over)', () => {
    const g = new SpatialGrid<number>(100);
    g.insert(1, 10, 10);
    g.clear();
    expect(g.query(10, 10, 50, [])).toEqual([]);
    g.insert(2, -250, -250);
    expect(g.query(-250, -250, 10, [])).toEqual([2]);
  });
});
