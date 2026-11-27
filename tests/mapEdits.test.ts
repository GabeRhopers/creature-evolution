import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/data';
import { buildMap, mapChecks, type MapBalance } from '../src/map/model';
import {
  addChoices, addThing, applyPlayMap, changedLists, createMap, currentMap, deleteMap, diffLists, exportMap, fingerprint, listsOf, madeOnOldMap,
  mapLists, MAPS_KEY, MAX_MAPS, moveThing, ORIGINAL, playMapId, readMaps, removeThing, renameMap, resizeThing, saveMap, setPlayMap, STORE_KEY,
  withLists,
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
  it('the Original is never saved over: edits live in maps of their own, as changes only', () => {
    const s = memory();
    expect(saveMap(s, shipped, ORIGINAL, moveThing(shipped, 'ridge:2', 12345, W))).toBe(false);
    expect(s.m.size).toBe(0);
    const m = createMap(s, shipped)!;
    expect(m.name).toBe('My map 1');
    expect(m.lists).toEqual({});
    const L = moveThing(shipped, 'ridge:2', 12345, W);
    expect(Object.keys(diffLists(shipped, L))).toEqual(['ridges']);
    expect(saveMap(s, shipped, m.id, L)).toBe(true);
    const maps = readMaps(s);
    expect(maps[0].base).toBe(fingerprint(shipped));
    expect(mapLists(shipped, maps, m.id).ridges[2].x).toBe(12345);
    expect(changedLists(shipped, mapLists(shipped, maps, m.id))).toBe(1);
    // The Original is always the shipped map.
    expect(mapLists(shipped, maps, ORIGINAL)).toEqual(shipped);
    expect(madeOnOldMap(shipped, maps[0])).toBe(false);
    // A second map gets the next name; names are kept unique and "Original" is taken.
    expect(createMap(s, shipped)!.name).toBe('My map 2');
    expect(renameMap(s, m.id, 'Original')).toBe('Original 1');
    expect(renameMap(s, m.id, 'Big islands')).toBe('Big islands');
    expect(renameMap(s, readMaps(s)[1].id, 'big islands')).toBe('big islands 1');
  });
  it('the game plays the Original unless the player picks a map, and falls back when it is deleted', () => {
    const s = memory();
    expect(playMapId(s)).toBe(ORIGINAL);
    const m = createMap(s, shipped, 'Eel cave moved', moveThing(shipped, 'cave:electric_eel', 2600, W))!;
    // Making a map does not change what is played.
    expect(playMapId(s)).toBe(ORIGINAL);
    const b0 = clone();
    expect(applyPlayMap(b0, s).id).toBe(ORIGINAL);
    expect(b0.bosses.list.find((x) => x.id === 'electric_eel')?.entranceX).toBe(2400);
    setPlayMap(s, m.id);
    const b = clone();
    expect(applyPlayMap(b, s)).toEqual({ id: m.id, name: 'Eel cave moved' });
    expect(currentMap.name).toBe('Eel cave moved');
    expect(b.bosses.list.find((x) => x.id === 'electric_eel')?.entranceX).toBe(2600);
    deleteMap(s, m.id);
    expect(playMapId(s)).toBe(ORIGINAL);
    expect(s.m.has('ce.map.play')).toBe(false);
    // An unknown pick is the Original too.
    s.setItem('ce.map.play', 'nope');
    expect(playMapId(s)).toBe(ORIGINAL);
    currentMap.id = ORIGINAL; currentMap.name = 'Original';
  });
  it('moves the old single set of edits into "My map 1" (not played) and drops the old key', () => {
    const s = memory();
    s.setItem(STORE_KEY, JSON.stringify({ kind: 'creature-evolution-map', v: 1, base: 'old', lists: { islands: [{ x: 'nope' }], ridges: [{ x: 5, width: 400, height: 150 }] } }));
    const maps = readMaps(s);
    expect(maps).toHaveLength(1);
    expect(maps[0].name).toBe('My map 1');
    expect(s.m.has(STORE_KEY)).toBe(false);
    expect(s.m.has(MAPS_KEY)).toBe(true);
    // Broken lists are dropped list by list.
    const L = mapLists(shipped, maps, maps[0].id);
    expect(L.islands).toEqual(shipped.islands);
    expect(L.ridges).toEqual([{ x: 5, width: 400, height: 150 }]);
    expect(madeOnOldMap(shipped, maps[0])).toBe(true);
    expect(playMapId(s)).toBe(ORIGINAL);
    expect(readMaps(s)).toHaveLength(1); // read again: no second copy
    s.setItem(MAPS_KEY, '{not json');
    expect(readMaps(s)).toEqual([]);
  });
  it('keeps at most MAX_MAPS maps on a device', () => {
    const s = memory();
    for (let i = 0; i < MAX_MAPS; i++) expect(createMap(s, shipped)).not.toBeNull();
    expect(createMap(s, shipped)).toBeNull();
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
