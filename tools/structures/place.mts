// Picks mid-water structure spots (each region its own mix, PLANS below) that stay clear of the ground, islands and the
// player start. Prints the JSON list for balance.json terrain.structures.
// Run: npx tsx tools/structures/place.mts
import balance from '../../src/data/balance.json' with { type: 'json' };
import { Terrain, type TerrainConfig, type StructureDef } from '../../src/systems/terrain.ts';

const W = balance.world.width;
const surfaceY = balance.world.surfaceY;
const seabedTop = balance.world.height - balance.world.seabedDepth;
const waterH = seabedTop - surfaceY;
const t = new Terrain({ ...(balance.terrain as TerrainConfig), structures: [] }, W, surfaceY, seabedTop);
const start = balance.world.startX;

type Plan = Array<{ kind: 'rock' | 'shelf'; at: number; y: number; width: number; height?: number }>;
const R = (at: number, y: number, width: number, height: number) => ({ kind: 'rock' as const, at, y, width, height });
const S = (at: number, y: number, width: number) => ({ kind: 'shelf' as const, at, y, width });
// Each region has its own mix (the art comes from STRUCTURE_LOOKS in worldTextures.ts). y = share of the water.
const PLANS: Record<string, Plan> = {
  // Coral Sea: coral ledges and stone outcrops through the Reef, one rock in the Deep.
  coral: [S(0.2, 0.45, 520), R(0.45, 0.6, 360, 200), S(0.65, 0.55, 440), R(0.85, 0.82, 420, 230)],
  // Swamp: sunken logs at every depth and one mud lump.
  swamp: [S(0.15, 0.3, 600), S(0.4, 0.55, 560), S(0.7, 0.78, 620), R(0.88, 0.62, 340, 180)],
  // Sargasso Sea: open ocean, no rock; floating weed mats high up.
  sargasso: [S(0.15, 0.15, 640), S(0.38, 0.28, 560), S(0.62, 0.2, 700), S(0.85, 0.34, 520)],
  // Volcanic Rift: big basalt outcrops, one ledge.
  volcano: [R(0.15, 0.55, 400, 260), R(0.35, 0.78, 460, 300), S(0.55, 0.5, 420), R(0.72, 0.68, 360, 220), R(0.9, 0.85, 440, 260)],
  // Twilight Trench: narrow ledges stepping down into the dark, two dark rocks.
  trench: [S(0.2, 0.72, 380), R(0.4, 0.82, 380, 240), S(0.5, 0.55, 380), S(0.6, 0.86, 420), R(0.8, 0.66, 340, 200)],
  // Kelp Forest: mossy stones among the giant kelp, one ledge.
  kelp: [R(0.25, 0.6, 380, 220), S(0.5, 0.45, 480), R(0.78, 0.8, 420, 240)],
  // Frozen Sea: ice shelves near the top, ice chunks below.
  ice: [S(0.15, 0.12, 600), S(0.4, 0.3, 520), R(0.6, 0.5, 360, 260), S(0.75, 0.22, 560), R(0.9, 0.72, 380, 240)],
};

const clear = (d: StructureDef) => {
  const half = d.width / 2 + 120;
  const top = surfaceY + waterH * d.y - (d.kind === 'rock' ? (d.height ?? 0) / 2 : 0);
  const bottom = surfaceY + waterH * d.y + (d.kind === 'rock' ? (d.height ?? 0) / 2 : 30);
  if (Math.abs(d.x - start) < 1600) return false;
  for (let x = d.x - half; x <= d.x + half; x += 20) {
    if (t.groundAt(x) - bottom < 220) return false;
    if (top - t.ceilAt(x) < 220) return false;
  }
  return true;
};

const out: StructureDef[] = [];
for (const reg of balance.regions.list) {
  const span = reg.to - reg.from;
  for (const p of PLANS[reg.id] ?? []) {
    let placed = false;
    // Try the planned spot, then nudge left and right until it is clear.
    for (let k = 0; k < 40 && !placed; k++) {
      const off = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.012;
      const d: StructureDef = { kind: p.kind, x: Math.round((reg.from + span * (p.at + off)) / 10) * 10, y: p.y, width: p.width };
      if (p.height) d.height = p.height;
      if (clear(d)) { out.push(d); placed = true; }
    }
    if (!placed) console.error(`no spot for ${p.kind} in ${reg.id}`);
  }
}
console.log(JSON.stringify(out));
