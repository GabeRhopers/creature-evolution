import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { buildMap, mapChecks, type MapBalance } from '../src/map/model';
import {
  addChoices, addThing, applyMapEdits, changedLists, diffLists, exportMap, fingerprint, listsOf, loadLists, moveThing,
  readSaved, removeThing, resizeThing, saveLists, savedOnOldMap, STORE_KEY, withLists,
} from '../src/map/edits';

const B = BALANCE as unknown as MapBalance;
const W = B.world.width;
const clone = (): MapBalance => JSON.parse(JSON.stringify(B));
const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const shipped = listsOf(B);

describe('map edits', () => {
  it('moves things (wrapped into the sea) without touching the original', () => {
    const L = moveThing(shipped, 'island:0', W + 500, W);
    expect(L.islands[0].x).toBe(500);
    expect(shipped.islands[0].x).toBe(B.terrain.islands[0].x);
    expect(moveThing(shipped, 'cave:electric_eel', 3000, W).caves.electric_eel).toBe(3000);
    expect(moveThing(shipped, 'gate:root_tangle', 1, W)).toBe(shipped);
  });
  it('resizes within safe ranges and keeps the file tidy', () => {
    let L = resizeThing(shipped, 'island:0', { width: 99999, size: 1, style: 'volcano' });
    expect(L.islands[0]).toMatchObject({ width: 4000, depth: 60, style: 'volcano' });
    L = resizeThing(L, 'island:0', { style: 'sand' });
    expect(L.islands[0].style).toBeUndefined();
    expect(resizeThing(shipped, 'seamount:0', { size: 0.0 }).seamounts[0].top).toBe(0.15);
    expect(resizeThing(shipped, 'ridge:0', { size: 333 }).ridges[0].height).toBe(335);
    const i = shipped.pieces.findIndex((p) => p.scale === undefined);
    expect(resizeThing(shipped, `scenery:${i}`, { scale: 1.5 }).pieces[i].scale).toBe(1.5);
    expect(resizeThing(resizeThing(shipped, `scenery:${i}`, { scale: 1.5 }), `scenery:${i}`, { scale: 1 }).pieces[i].scale).toBeUndefined();
  });
  it('adds every kind and deletes (but never a cave entrance)', () => {
    const choices = addChoices(shipped);
    expect(choices.some((c) => c.kind === 'island' && c.label === 'mangrove')).toBe(true);
    expect(choices.some((c) => c.kind === 'scenery' && c.label === 'galleon')).toBe(true);
    expect(choices.some((c) => c.kind === 'float' && c.label === 'rowboat')).toBe(true);
    for (const c of choices) {
      const r = addThing(shipped, c, 50000, W);
      expect(r.id).not.toBe('');
      const m = buildMap(withLists(B, r.lists));
      expect(m.things.find((t) => t.id === r.id)?.x).toBe(50000);
    }
    const r = addThing(shipped, { kind: 'island', label: 'iceberg' }, 1000, W);
    expect(r.lists.islands.at(-1)).toEqual({ x: 1000, width: 700, depth: 200, style: 'iceberg' });
    expect(removeThing(r.lists, r.id).islands.length).toBe(shipped.islands.length);
    expect(removeThing(shipped, 'cave:electric_eel')).toBe(shipped);
  });
  it('saves only the lists that changed, and reads them back', () => {
    const s = memory();
    saveLists(shipped, shipped, s);
    expect(s.m.has(STORE_KEY)).toBe(false);
    const L = moveThing(shipped, 'ridge:2', 12345, W);
    expect(Object.keys(diffLists(shipped, L))).toEqual(['ridges']);
    saveLists(shipped, L, s);
    expect(readSaved(s)?.base).toBe(fingerprint(shipped));
    expect(loadLists(shipped, s).ridges[2].x).toBe(12345);
    expect(changedLists(shipped, loadLists(shipped, s))).toBe(1);
    expect(savedOnOldMap(shipped, s)).toBe(false);
    // Back to shipped: the key is removed.
    saveLists(shipped, shipped, s);
    expect(s.m.has(STORE_KEY)).toBe(false);
  });
  it('ignores broken saves list by list', () => {
    const s = memory();
    s.setItem(STORE_KEY, JSON.stringify({ kind: 'creature-evolution-map', v: 1, base: 'x', lists: { islands: [{ x: 'nope' }], ridges: [{ x: 5, width: 400, height: 150 }] } }));
    const L = loadLists(shipped, s);
    expect(L.islands).toEqual(shipped.islands);
    expect(L.ridges).toEqual([{ x: 5, width: 400, height: 150 }]);
    expect(savedOnOldMap(shipped, s)).toBe(true);
    s.setItem(STORE_KEY, '{not json');
    expect(loadLists(shipped, s)).toEqual(shipped);
  });
  it('the game applies the device edits at startup', () => {
    const s = memory();
    const b = clone();
    expect(applyMapEdits(b, s)).toBe(0);
    saveLists(shipped, addThing(moveThing(shipped, 'cave:electric_eel', 2600, W), { kind: 'scenery', label: 'anchor' }, 7000, W).lists, s);
    expect(applyMapEdits(b, s)).toBe(2);
    expect(b.bosses.list.find((x) => x.id === 'electric_eel')?.entranceX).toBe(2600);
    expect(b.scenery.pieces.at(-1)).toEqual({ kind: 'anchor', x: 7000 });
  });
  it('the export carries everything the import tool needs', () => {
    const ex = JSON.parse(exportMap(shipped));
    expect(ex.kind).toBe('creature-evolution-map-export');
    expect(ex.terrain.islands.length).toBe(shipped.islands.length);
    expect(ex.scenery.floats.length).toBe(shipped.floats.length);
    expect(ex.caves.electric_eel).toBe(2400);
  });
  it('checks see edits: an island on the start is flagged', () => {
    const L = moveThing(shipped, 'island:0', B.world.startX, W);
    const issues = mapChecks(buildMap(withLists(B, L)));
    expect(issues.some((i) => i.thing === 'island:0' && /start/.test(i.text))).toBe(true);
    expect(mapChecks(buildMap(withLists(B, shipped)))).toEqual([]);
  });
});
