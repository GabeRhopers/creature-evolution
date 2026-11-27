// Map editor, Phase 2: editing the big picture. Everything here is pure (storage is passed in), unit tested in
// tests/mapEdits.test.ts. The editable parts of the sea are five lists from balance.json (islands, seamounts, ridges,
// scenery pieces, floats) plus each boss's cave entrance x. The map page edits a copy of them (`MapLists`); every change
// is saved on the device as the lists that differ from the shipped ones (`ce.admin.map`, like Enemy settings) and the
// game applies them at startup (`applyMapEdits` in main.ts). Export writes a file that tools/map/import_map.mjs copies into
// balance.json, which makes the edits permanent for everyone.
import type { IslandDef, RidgeDef, SeamountDef } from '../systems/terrain';
import type { MapBalance, ThingKind } from './model';

export interface PieceDef { kind: string; x: number; scale?: number; sink?: number }
export interface FloatDef { kind: string; x: number }
export interface MapLists {
  islands: IslandDef[];
  seamounts: SeamountDef[];
  ridges: RidgeDef[];
  pieces: PieceDef[];
  floats: FloatDef[];
  /** Boss id -> cave entrance x. */
  caves: Record<string, number>;
}
export type ListKey = keyof MapLists;
export const LIST_KEYS: ListKey[] = ['islands', 'seamounts', 'ridges', 'pieces', 'floats', 'caves'];

/** Which list each kind of thing lives in. Gates and the start are not edited here (they follow the region borders). */
export const LIST_OF: Partial<Record<ThingKind, ListKey>> = { island: 'islands', seamount: 'seamounts', ridge: 'ridges', scenery: 'pieces', float: 'floats', cave: 'caves' };
export const editable = (kind: ThingKind) => kind in LIST_OF;

/** Safe ranges for the size sliders (a bit wider than anything shipped). */
export const LIMITS = {
  island: { width: [200, 4000], size: [60, 1000] },
  seamount: { width: [400, 6000], size: [0.15, 0.95] },
  ridge: { width: [200, 3000], size: [40, 600] },
  scenery: { scale: [0.4, 3] },
} as const;
export const ISLAND_STYLES = ['sand', 'mangrove', 'volcano', 'iceberg', 'cave'] as const;
/** The pre-v0.70 key of the single set of device edits (read once and moved into "My map"). */
export const STORE_KEY = 'ce.admin.map';

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const clamp = (v: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, v));
const round = (v: number, step: number) => Math.round(v / step) * step;

/** A copy of the editable lists of a balance. */
export function listsOf(b: MapBalance): MapLists {
  const caves: Record<string, number> = {};
  for (const s of b.bosses.list) if (typeof s.entranceX === 'number') caves[s.id] = s.entranceX;
  return copy({ islands: b.terrain.islands, seamounts: b.terrain.seamounts, ridges: b.terrain.ridges, pieces: b.scenery.pieces as PieceDef[], floats: b.scenery.floats, caves });
}

/** A balance with these lists in place of its own (a new object; the original is untouched). */
export function withLists(b: MapBalance, L: MapLists): MapBalance {
  return {
    ...b,
    terrain: { ...b.terrain, islands: L.islands, seamounts: L.seamounts, ridges: L.ridges },
    scenery: { ...b.scenery, pieces: L.pieces, floats: L.floats },
    bosses: { ...b.bosses, list: b.bosses.list.map((s) => (s.id in L.caves ? { ...s, entranceX: L.caves[s.id] } : s)) },
  };
}

/** Put these lists into the balance itself (the game, at startup). */
export function applyLists(b: MapBalance, L: MapLists): void {
  const c = copy(L);
  b.terrain.islands = c.islands;
  b.terrain.seamounts = c.seamounts;
  b.terrain.ridges = c.ridges;
  b.scenery.pieces = c.pieces;
  b.scenery.floats = c.floats;
  for (const s of b.bosses.list) if (s.id in c.caves) s.entranceX = c.caves[s.id];
}

/** A short fingerprint of the shipped lists, so the map can tell when an update changed the map under saved edits. */
export function fingerprint(L: MapLists): string {
  const s = JSON.stringify(L);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------- edits (each returns new lists)

export function parseId(id: string): { kind: ThingKind; key: string } {
  const [kind, key] = id.split(':');
  return { kind: kind as ThingKind, key: key ?? '' };
}

/** Move a thing to world x (wrapped into the sea, whole px). */
export function moveThing(L: MapLists, id: string, x: number, worldW: number): MapLists {
  const { kind, key } = parseId(id);
  const list = LIST_OF[kind];
  if (!list) return L;
  const nx = Math.round(((x % worldW) + worldW) % worldW);
  const n = copy(L);
  if (list === 'caves') { if (key in n.caves) n.caves[key] = nx; return n; }
  const item = (n[list] as Array<{ x: number }>)[+key];
  if (item) item.x = nx;
  return n;
}

export interface SizeChange { width?: number; size?: number; scale?: number; style?: string }
/** Resize a thing: width, and size (island depth, seamount top share, ridge height) or a scenery piece's scale; island style. */
export function resizeThing(L: MapLists, id: string, c: SizeChange): MapLists {
  const { kind, key } = parseId(id);
  const n = copy(L);
  const i = +key;
  if (kind === 'island' && n.islands[i]) {
    const t = n.islands[i];
    if (c.width !== undefined) t.width = round(clamp(c.width, LIMITS.island.width), 10);
    if (c.size !== undefined) t.depth = round(clamp(c.size, LIMITS.island.size), 5);
    if (c.style !== undefined && (ISLAND_STYLES as readonly string[]).includes(c.style)) {
      if (c.style === 'sand') delete t.style; else t.style = c.style as IslandDef['style'];
    }
  } else if (kind === 'seamount' && n.seamounts[i]) {
    const t = n.seamounts[i];
    if (c.width !== undefined) t.width = round(clamp(c.width, LIMITS.seamount.width), 10);
    if (c.size !== undefined) t.top = Math.round(clamp(c.size, LIMITS.seamount.size) * 100) / 100;
  } else if (kind === 'ridge' && n.ridges[i]) {
    const t = n.ridges[i];
    if (c.width !== undefined) t.width = round(clamp(c.width, LIMITS.ridge.width), 10);
    if (c.size !== undefined) t.height = round(clamp(c.size, LIMITS.ridge.size), 5);
  } else if (kind === 'scenery' && n.pieces[i]) {
    const t = n.pieces[i];
    if (c.scale !== undefined) {
      const s = Math.round(clamp(c.scale, LIMITS.scenery.scale) * 20) / 20;
      if (Math.abs(s - 1) < 1e-9) delete t.scale; else t.scale = s;
    }
  } else return L;
  return n;
}

/** What can be added: islands by style, seamounts, ridges, and scenery and float kinds the game already draws. */
export interface AddChoice { kind: ThingKind; label: string }
export function addChoices(shipped: MapLists): AddChoice[] {
  const pieces = [...new Set(shipped.pieces.map((p) => p.kind))].sort();
  const floats = [...new Set(shipped.floats.map((p) => p.kind))].sort();
  return [
    ...ISLAND_STYLES.filter((s) => s !== 'cave').map((s) => ({ kind: 'island' as ThingKind, label: s })),
    { kind: 'seamount', label: 'seamount' },
    { kind: 'ridge', label: 'ridge' },
    ...pieces.map((k) => ({ kind: 'scenery' as ThingKind, label: k })),
    ...floats.map((k) => ({ kind: 'float' as ThingKind, label: k })),
  ];
}

/** Add a new thing at x with ordinary sizes. Returns the new lists and the new thing's id. */
export function addThing(L: MapLists, c: AddChoice, x: number, worldW: number): { lists: MapLists; id: string } {
  const n = copy(L);
  const nx = Math.round(((x % worldW) + worldW) % worldW);
  if (c.kind === 'island') {
    const t: IslandDef = { x: nx, width: 700, depth: 200 };
    if (c.label !== 'sand') t.style = c.label as IslandDef['style'];
    return { lists: n, id: `island:${n.islands.push(t) - 1}` };
  }
  if (c.kind === 'seamount') return { lists: n, id: `seamount:${n.seamounts.push({ x: nx, width: 1400, top: 0.5 }) - 1}` };
  if (c.kind === 'ridge') return { lists: n, id: `ridge:${n.ridges.push({ x: nx, width: 500, height: 200 }) - 1}` };
  if (c.kind === 'scenery') return { lists: n, id: `scenery:${n.pieces.push({ kind: c.label, x: nx }) - 1}` };
  if (c.kind === 'float') return { lists: n, id: `float:${n.floats.push({ kind: c.label, x: nx }) - 1}` };
  return { lists: L, id: '' };
}

/** Delete a thing (cave entrances can be moved but not deleted: their boss needs one). */
export function removeThing(L: MapLists, id: string): MapLists {
  const { kind, key } = parseId(id);
  const list = LIST_OF[kind];
  if (!list || list === 'caves') return L;
  const n = copy(L);
  (n[list] as unknown[]).splice(+key, 1);
  return n;
}

// ---------------------------------------------------------------- saving on the device: the Original and your maps
//
// The Original (the shipped map in balance.json) is never changed by the editor and is always the default to play.
// Edits live in maps of their own ("My map 1", ...), each saved as the lists that differ from the Original. The game plays
// the Original unless the player picked another map (PLAY_KEY), and it reads that choice once, at startup.

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const ORIGINAL = 'original';
export const MAPS_KEY = 'ce.maps';
export const PLAY_KEY = 'ce.map.play';
/** Most maps kept on one device. */
export const MAX_MAPS = 12;

/** One map of the player's: a name, and its changes from the Original it was made from (`base` = that Original's fingerprint). */
export interface CustomMap { id: string; name: string; base: string; lists: Partial<MapLists>; updated: number }
/** The pre-v0.70 single set of device edits (moved into "My map" on first read). */
export interface SavedMap { kind: 'creature-evolution-map'; v: 1; base: string; lists: Partial<MapLists> }

/** Only the lists that differ from shipped. */
export function diffLists(shipped: MapLists, L: MapLists): Partial<MapLists> {
  const out: Partial<MapLists> = {};
  for (const k of LIST_KEYS) if (JSON.stringify(L[k]) !== JSON.stringify(shipped[k])) (out as Record<string, unknown>)[k] = copy(L[k]);
  return out;
}

/** How many lists differ (0 = the shipped map). */
export const changedLists = (shipped: MapLists, L: MapLists) => Object.keys(diffLists(shipped, L)).length;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const okX = (o: unknown) => !!o && typeof o === 'object' && isNum((o as { x?: unknown }).x);
/** Saved lists checked item by item (a broken list is dropped, so that list stays as the Original). */
function checkLists(raw: unknown): Partial<MapLists> {
  const lists: Partial<MapLists> = {};
  if (!raw || typeof raw !== 'object') return lists;
  const L = raw as Record<string, unknown>;
  const arr = (k: ListKey, ok: (o: Record<string, unknown>) => boolean) => {
    const a = L[k];
    if (Array.isArray(a) && a.every((o) => okX(o) && ok(o))) (lists as Record<string, unknown>)[k] = a;
  };
  arr('islands', (o) => isNum(o.width) && isNum(o.depth));
  arr('seamounts', (o) => isNum(o.width) && isNum(o.top));
  arr('ridges', (o) => isNum(o.width) && isNum(o.height));
  arr('pieces', (o) => typeof o.kind === 'string');
  arr('floats', (o) => typeof o.kind === 'string');
  if (L.caves && typeof L.caves === 'object' && Object.values(L.caves).every(isNum)) lists.caves = L.caves as Record<string, number>;
  return lists;
}

/** The old single save (pre-v0.70), or null. */
export function readSaved(store: Store): SavedMap | null {
  try {
    const v = JSON.parse(store.getItem(STORE_KEY) || 'null');
    if (!v || v.kind !== 'creature-evolution-map' || !v.lists || typeof v.lists !== 'object') return null;
    return { kind: 'creature-evolution-map', v: 1, base: String(v.base ?? ''), lists: checkLists(v.lists) };
  } catch {
    return null;
  }
}

/** Every map of the player's on this device (moving the old single save into "My map" the first time). */
export function readMaps(store: Store): CustomMap[] {
  let maps: CustomMap[] = [];
  try {
    const v = JSON.parse(store.getItem(MAPS_KEY) || 'null');
    if (v && Array.isArray(v.maps))
      maps = v.maps
        .filter((m: unknown) => !!m && typeof (m as CustomMap).id === 'string' && (m as CustomMap).id !== ORIGINAL && typeof (m as CustomMap).name === 'string')
        .map((m: CustomMap) => ({ id: m.id, name: m.name.slice(0, 40), base: String(m.base ?? ''), lists: checkLists(m.lists), updated: isNum(m.updated) ? m.updated : 0 }));
  } catch {
    maps = [];
  }
  const old = readSaved(store);
  if (old) {
    if (Object.keys(old.lists).length) maps.push({ id: uniqueId(maps), name: uniqueName(maps, 'My map'), base: old.base, lists: old.lists, updated: Date.now() });
    // Drop the old key only once the maps are safely written (a full or blocked store keeps both).
    if (writeMaps(store, maps)) {
      try {
        store.removeItem(STORE_KEY);
      } catch {
        /* storage blocked */
      }
    }
  }
  return maps.slice(0, MAX_MAPS);
}

function writeMaps(store: Store, maps: CustomMap[]): boolean {
  try {
    if (!maps.length) store.removeItem(MAPS_KEY);
    else store.setItem(MAPS_KEY, JSON.stringify({ kind: 'creature-evolution-maps', v: 1, maps }));
    return true;
  } catch {
    return false; // storage blocked or full: the edit still shows until the page closes
  }
}

function uniqueId(maps: CustomMap[]): string {
  for (let n = maps.length + 1; ; n++) if (!maps.some((m) => m.id === `m${n}`)) return `m${n}`;
}
/** "My map 1", "My map 2", ... (or the wanted name, numbered if it is taken). */
export function uniqueName(maps: CustomMap[], want = 'My map'): string {
  const base = want.trim().slice(0, 40) || 'My map';
  const taken = (n: string) => n.toLowerCase() === 'original' || maps.some((m) => m.name.toLowerCase() === n.toLowerCase());
  if (want !== 'My map' && !taken(base)) return base;
  for (let n = 1; ; n++) if (!taken(`${base} ${n}`)) return `${base} ${n}`;
}

/** The lists of a map: the Original's, with the map's own changes in place. Unknown id = the Original. */
export function mapLists(shipped: MapLists, maps: CustomMap[], id: string): MapLists {
  const m = maps.find((x) => x.id === id);
  const L = copy(shipped);
  if (m) for (const k of LIST_KEYS) if (m.lists[k]) (L as unknown as Record<string, unknown>)[k] = copy(m.lists[k]);
  // A cave entrance for a boss that no longer exists is dropped; a new boss keeps its shipped entrance.
  L.caves = { ...shipped.caves, ...Object.fromEntries(Object.entries(L.caves).filter(([k]) => k in shipped.caves)) };
  return L;
}

/** A new map of the player's, starting as a copy of `from` (the Original's lists by default). Null when the device is full. */
export function createMap(store: Store, shipped: MapLists, name?: string, from: MapLists = shipped): CustomMap | null {
  const maps = readMaps(store);
  if (maps.length >= MAX_MAPS) return null;
  const m: CustomMap = { id: uniqueId(maps), name: uniqueName(maps, name ?? 'My map'), base: fingerprint(shipped), lists: diffLists(shipped, from), updated: Date.now() };
  writeMaps(store, [...maps, m]);
  return m;
}

/** Save a map's lists (never the Original: that id is refused). */
export function saveMap(store: Store, shipped: MapLists, id: string, L: MapLists): boolean {
  if (id === ORIGINAL) return false;
  const maps = readMaps(store);
  const m = maps.find((x) => x.id === id);
  if (!m) return false;
  m.lists = diffLists(shipped, L);
  m.base = fingerprint(shipped);
  m.updated = Date.now();
  writeMaps(store, maps);
  return true;
}

export function renameMap(store: Store, id: string, name: string): string | null {
  const maps = readMaps(store);
  const m = maps.find((x) => x.id === id);
  if (!m) return null;
  m.name = uniqueName(maps.filter((x) => x !== m), name);
  writeMaps(store, maps);
  return m.name;
}

/** Delete one of the player's maps; if the game was set to play it, it goes back to the Original. */
export function deleteMap(store: Store, id: string): void {
  const playing = playMapId(store) === id;
  writeMaps(store, readMaps(store).filter((m) => m.id !== id));
  if (playing) setPlayMap(store, ORIGINAL);
}

/** True when a map was made on a different Original (an update changed the shipped map since). */
export function madeOnOldMap(shipped: MapLists, m: CustomMap | undefined): boolean {
  return !!m && Object.keys(m.lists).length > 0 && m.base !== fingerprint(shipped);
}

/** The map the game plays: the player's pick if it still exists, otherwise the Original. */
export function playMapId(store: Store): string {
  try {
    const id = store.getItem(PLAY_KEY);
    if (id && id !== ORIGINAL && readMaps(store).some((m) => m.id === id)) return id;
  } catch {
    /* storage blocked */
  }
  return ORIGINAL;
}
export function setPlayMap(store: Store, id: string): void {
  try {
    if (id === ORIGINAL) store.removeItem(PLAY_KEY);
    else store.setItem(PLAY_KEY, id);
  } catch {
    /* storage blocked */
  }
}
/** The display name of a map id ("Original" for the shipped map or an unknown id). */
export function mapName(store: Store, id: string): string {
  return readMaps(store).find((m) => m.id === id)?.name ?? 'Original';
}

/** The map this page is playing (set once at startup by applyPlayMap). */
export const currentMap = { id: ORIGINAL, name: 'Original' };

/** The game, at startup: play the chosen map (the Original unless the player picked one). Returns its id and name. */
export function applyPlayMap(b: MapBalance, store: Store): { id: string; name: string } {
  const id = playMapId(store);
  if (id === ORIGINAL) return { ...currentMap };
  const maps = readMaps(store);
  applyLists(b, mapLists(listsOf(b), maps, id));
  currentMap.id = id;
  currentMap.name = maps.find((m) => m.id === id)!.name;
  return { ...currentMap };
}

/** The whole edited map as a file, ready for tools/map/import_map.mjs. */
export function exportMap(L: MapLists): string {
  return JSON.stringify({ kind: 'creature-evolution-map-export', v: 1, terrain: { islands: L.islands, seamounts: L.seamounts, ridges: L.ridges }, scenery: { pieces: L.pieces, floats: L.floats }, caves: L.caves }, null, 2);
}
