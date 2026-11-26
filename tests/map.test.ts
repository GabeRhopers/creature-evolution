import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { buildMap, depthShare, mapChecks, regionAt, regionSummary, type MapBalance } from '../src/map/model';

const B = BALANCE as unknown as MapBalance;
const clone = (): MapBalance => JSON.parse(JSON.stringify(B));

describe('map model', () => {
  const m = buildMap(B);
  it('lists every island, seamount, ridge, scenery piece, float, gate, cave and the start', () => {
    const n = (k: string) => m.things.filter((t) => t.kind === k).length;
    expect(n('island')).toBe(B.terrain.islands.length);
    expect(n('seamount')).toBe(B.terrain.seamounts.length);
    expect(n('scenery')).toBe(B.scenery.pieces.length);
    expect(n('gate')).toBe(B.gates.list.length);
    expect(n('cave')).toBe(1);
    expect(n('start')).toBe(1);
  });
  it('uses the game\'s own seabed', () => {
    const top = depthShare(m, m.terrain.groundAt(2400));
    expect(top).toBeGreaterThan(0.45);
    expect(top).toBeLessThan(0.6); // the Coral Cave seamount top
    expect(regionAt(m, 2400).id).toBe('coral');
    expect(regionAt(m, B.world.width + 10).id).toBe('coral'); // the loop
    expect(regionSummary(m, 'coral').cave).toBe(1);
  });
  it('today\'s map has no errors', () => {
    const errs = mapChecks(m).filter((i) => i.level === 'error');
    expect(errs).toEqual([]);
  });
});

describe('map checks catch broken layouts', () => {
  it('a gap between regions', () => {
    const b = clone(); b.regions.list[1].from += 500;
    expect(mapChecks(buildMap(b)).some((i) => i.level === 'error' && /ends at/.test(i.text))).toBe(true);
  });
  it('a gate away from a border', () => {
    const b = clone(); b.gates.list[0].x += 2000;
    expect(mapChecks(buildMap(b)).some((i) => i.level === 'error' && /Gate/.test(i.text))).toBe(true);
  });
  it('a cave entrance too deep for its boss level', () => {
    const b = clone(); b.bosses.list[0].entranceX = 12000; // open sand at the seabed
    b.terrain.seamounts = b.terrain.seamounts.filter((s) => Math.abs(s.x - 12000) > s.width);
    expect(mapChecks(buildMap(b)).some((i) => i.level === 'error' && /too deep/.test(i.text))).toBe(true);
  });
  it('an island that closes the water', () => {
    const b = clone(); b.terrain.islands[0].depth = 5000;
    expect(mapChecks(buildMap(b)).some((i) => /water is left/.test(i.text))).toBe(true);
  });
  it('something on the start, and crowded scenery', () => {
    const b = clone();
    b.scenery.pieces.push({ kind: 'arch', x: B.world.startX + 50 }, { kind: 'galleon', x: B.world.startX + 60 });
    const issues = mapChecks(buildMap(b));
    expect(issues.some((i) => /start/.test(i.text))).toBe(true);
    expect(issues.some((i) => /on top of each other/.test(i.text))).toBe(true);
  });
  it('outside the world', () => {
    const b = clone(); b.scenery.pieces[0].x = -50;
    expect(mapChecks(buildMap(b)).some((i) => /outside the world/.test(i.text))).toBe(true);
  });
});
