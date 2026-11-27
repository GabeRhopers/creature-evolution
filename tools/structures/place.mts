// Picks mid-water structure spots (3 per region) that stay clear of the ground, islands and the
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

const plan: Array<{ kind: 'rock' | 'shelf'; at: number; y: number; width: number; height?: number }> = [
  { kind: 'shelf', at: 0.22, y: 0.5, width: 520 },
  { kind: 'rock', at: 0.5, y: 0.58, width: 360, height: 200 },
  { kind: 'rock', at: 0.78, y: 0.8, width: 420, height: 230 },
];

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
  for (const p of plan) {
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
