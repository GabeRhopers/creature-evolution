// The map editor's model (Phase 1: view and checks). Everything here is pure: the world as a list of things the map shows
// (regions, seabed shapes, islands, scenery, floats, gates, cave entrances, the start), and the checks that warn about a
// layout that would break the game. The same Terrain class the game uses draws the seabed, so what the map shows is what
// you swim through. Unit tested in tests/map.test.ts.
import { Terrain, type TerrainConfig } from '../systems/terrain';

export interface MapBalance {
  world: { width: number; height: number; startX: number; surfaceY: number; seabedDepth: number };
  terrain: TerrainConfig & { [k: string]: unknown };
  regions: { list: Array<{ id: string; name: string; from: number; to: number; water: string[] }> };
  scenery: { pieces: Array<{ kind: string; x: number }>; floats: Array<{ kind: string; x: number }>; hide?: string[] };
  gates: { list: Array<{ id: string; name: string; x: number; crab?: number }> };
  bosses: { list: Array<{ id: string; name: string; cave?: string; entranceX?: number; level?: number }> };
  areas: { list: Array<{ id: string; name: string; from: number; to: number }> };
  stages: { list: Array<{ id: string; name: string; from: number; to: number; maxDepth: number }> };
}

export type ThingKind = 'island' | 'seamount' | 'ridge' | 'scenery' | 'float' | 'gate' | 'cave' | 'start';
export interface Thing {
  /** Stable id, like "island:3" (its index in balance.json) or "start". */
  id: string;
  kind: ThingKind;
  /** What it is: the island style, the scenery kind, the gate or boss name. */
  label: string;
  x: number;
  /** Width in world px (0 for a point). */
  width: number;
  /** Island: depth below the surface; seamount: top as a share of the water; ridge: height above the seabed. */
  size?: number;
}

export interface MapModel {
  b: MapBalance;
  width: number;
  surfaceY: number;
  seabedTop: number;
  terrain: Terrain;
  things: Thing[];
}

export function buildMap(b: MapBalance): MapModel {
  const width = b.world.width;
  const surfaceY = b.world.surfaceY;
  const seabedTop = b.world.height - b.world.seabedDepth;
  const terrain = new Terrain(b.terrain as TerrainConfig, width, surfaceY, seabedTop);
  const things: Thing[] = [];
  b.terrain.islands.forEach((t, i) => things.push({ id: `island:${i}`, kind: 'island', label: t.style ?? 'sand', x: t.x, width: t.width, size: t.depth }));
  b.terrain.seamounts.forEach((t, i) => things.push({ id: `seamount:${i}`, kind: 'seamount', label: 'seamount', x: t.x, width: t.width, size: t.top }));
  b.terrain.ridges.forEach((t, i) => things.push({ id: `ridge:${i}`, kind: 'ridge', label: 'ridge', x: t.x, width: t.width, size: t.height }));
  b.scenery.pieces.forEach((t, i) => things.push({ id: `scenery:${i}`, kind: 'scenery', label: t.kind, x: t.x, width: 0 }));
  b.scenery.floats.forEach((t, i) => things.push({ id: `float:${i}`, kind: 'float', label: t.kind, x: t.x, width: 0 }));
  b.gates.list.forEach((g) => things.push({ id: `gate:${g.id}`, kind: 'gate', label: g.name, x: g.x, width: 0 }));
  b.bosses.list.forEach((s) => s.entranceX !== undefined && things.push({ id: `cave:${s.id}`, kind: 'cave', label: s.cave ?? s.name, x: s.entranceX, width: 0 }));
  things.push({ id: 'start', kind: 'start', label: 'Start', x: b.world.startX, width: 0 });
  return { b, width, surfaceY, seabedTop, terrain, things };
}

/** The region at x. */
export function regionAt(m: MapModel, x: number) {
  const w = ((x % m.width) + m.width) % m.width;
  return m.b.regions.list.find((r) => w >= r.from && w < r.to) ?? m.b.regions.list[0];
}
/** How deep a y is, as a share of the water (0 = surface, 1 = seabed). */
export const depthShare = (m: MapModel, y: number) => (y - m.surfaceY) / (m.seabedTop - m.surfaceY);

export interface MapIssue {
  level: 'error' | 'warn';
  text: string;
  x: number;
  thing?: string;
}

/** Loop distance between two x. */
const gap = (m: MapModel, a: number, b: number) => {
  const d = Math.abs(a - b) % m.width;
  return Math.min(d, m.width - d);
};

export const CHECKS = {
  /** No island, seamount or ridge may cover the start, and no scenery this close to it. */
  startClear: 700,
  /** The narrowest water passage under an island (between its underside and the ground), in world px. */
  passage: 110,
  /** A gate may sit this far from a region border. */
  gateSnap: 150,
};

/** Everything on the map that would break or spoil the game. */
export function mapChecks(m: MapModel): MapIssue[] {
  const out: MapIssue[] = [];
  const { b, terrain } = m;
  const things = m.things;
  // Regions: they must cover the loop from 0 to the world width with no gap or overlap.
  const regs = [...b.regions.list].sort((a, c) => a.from - c.from);
  if (regs[0]?.from !== 0) out.push({ level: 'error', text: `The first region starts at ${regs[0]?.from}, not 0`, x: 0 });
  for (let i = 1; i < regs.length; i++)
    if (regs[i].from !== regs[i - 1].to)
      out.push({ level: 'error', text: `${regs[i - 1].name} ends at ${regs[i - 1].to} but ${regs[i].name} starts at ${regs[i].from}`, x: regs[i].from });
  if (regs.at(-1)?.to !== m.width) out.push({ level: 'error', text: `The last region ends at ${regs.at(-1)?.to}, not at the world width ${m.width}`, x: m.width });
  // Everything inside the world.
  for (const t of things) if (t.x < 0 || t.x >= m.width) out.push({ level: 'error', text: `${t.label} is outside the world (x ${t.x})`, x: t.x, thing: t.id });
  // The start stays clear of anything solid (scenery you swim past is fine; the arch is solid rock).
  const start = b.world.startX;
  for (const t of things) {
    const solid = t.kind === 'island' || t.kind === 'seamount' || t.kind === 'ridge' || t.kind === 'cave' || (t.kind === 'scenery' && t.label === 'arch');
    if (!solid) continue;
    if (gap(m, t.x, start) < t.width / 2 + CHECKS.startClear / 2) out.push({ level: 'warn', text: `${cap(t.label)}${t.kind === 'island' ? ' island' : ''} is close to where new runs start`, x: t.x, thing: t.id });
  }
  // Gates sit on region borders.
  const borders = regs.map((r) => r.from).concat(m.width);
  for (const g of b.gates.list) {
    const near = Math.min(...borders.map((x) => gap(m, g.x, x)));
    if (near > CHECKS.gateSnap) out.push({ level: 'error', text: `Gate ${g.name} is ${Math.round(near)} px from a region border`, x: g.x, thing: `gate:${g.id}` });
  }
  // Cave entrances: a hero must be able to swim down to them at the boss's level.
  for (const s of b.bosses.list) {
    if (s.entranceX === undefined) continue;
    const stage = b.stages.list.find((st) => (s.level ?? 1) >= st.from && (s.level ?? 1) <= st.to) ?? b.stages.list.at(-1)!;
    const depth = depthShare(m, terrain.groundAt(s.entranceX));
    if (depth > stage.maxDepth + 0.02)
      out.push({ level: 'error', text: `${s.cave ?? s.name} is too deep for a level ${s.level} ${stage.name.toLowerCase()} (${Math.round(depth * 100)}% down, it can reach ${Math.round(stage.maxDepth * 100)}%)`, x: s.entranceX, thing: `cave:${s.id}` });
  }
  // Islands: leave a passage of water under them (cave rocks roof the Trench on purpose: same check, they keep a passage too).
  b.terrain.islands.forEach((isl, i) => {
    let narrow = Infinity, at = isl.x;
    for (let x = isl.x - isl.width / 2; x <= isl.x + isl.width / 2; x += 20) {
      const c = terrain.ceilAt(x);
      if (!isFinite(c)) continue;
      const room = terrain.groundAt(x) - c;
      if (room < narrow) { narrow = room; at = x; }
    }
    if (narrow < CHECKS.passage)
      out.push({ level: narrow <= 0 ? 'error' : 'warn', text: `Under the ${isl.style ?? 'sand'} island only ${Math.max(0, Math.round(narrow))} px of water is left`, x: at, thing: `island:${i}` });
  });
  // Islands overlapping each other (cave rocks overlap on purpose: together they roof the Trench).
  const isl = b.terrain.islands.map((t, i) => ({ ...t, i })).sort((a, c) => a.x - c.x);
  for (let i = 1; i < isl.length; i++) {
    const a = isl[i - 1], c = isl[i];
    if (a.style === 'cave' && c.style === 'cave') continue;
    if (c.x - c.width / 2 < a.x + a.width / 2) out.push({ level: 'warn', text: `Two islands overlap (${a.style ?? 'sand'} and ${c.style ?? 'sand'})`, x: (a.x + c.x) / 2, thing: `island:${c.i}` });
  }
  // Big scenery pieces drawn over each other (small ones like chests, cannons and vents sit next to them on purpose).
  const sc = b.scenery.pieces.map((t, i) => ({ ...t, i, w: FOOTPRINT[t.kind] ?? 0 })).filter((t) => t.w >= 250).sort((a, c) => a.x - c.x);
  for (let i = 1; i < sc.length; i++)
    if (sc[i].x - sc[i - 1].x < (sc[i].w + sc[i - 1].w) / 2)
      out.push({ level: 'warn', text: `${cap(sc[i - 1].kind)} and ${sc[i].kind} are on top of each other`, x: sc[i].x, thing: `scenery:${sc[i].i}` });
  return out;
}

/** About how wide each scenery piece is drawn, in world px (the map draws them this wide too). */
export const FOOTPRINT: Record<string, number> = {
  galleon: 640, wreck: 520, submarine: 420, whale: 560, ruins: 320, arch: 300, anchor: 90, cannon: 90, chest: 70, helmet: 60, vent: 60,
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A short summary of a region: how many of each thing it holds. */
export function regionSummary(m: MapModel, id: string): Record<ThingKind, number> {
  const r = m.b.regions.list.find((x) => x.id === id)!;
  const out = { island: 0, seamount: 0, ridge: 0, scenery: 0, float: 0, gate: 0, cave: 0, start: 0 } as Record<ThingKind, number>;
  for (const t of m.things) if (t.x >= r.from && t.x < r.to) out[t.kind]++;
  return out;
}
