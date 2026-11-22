// Regions of the looping sea (left to right): the Coral Sea, the Mangrove Swamp, the Volcanic Rift and the Frozen Sea.
// Each region has its own water colors, ground, rocks and plants; neighbors blend over `blend` px.
// Pure data and math; numbers live in balance.json "regions".
import { bayer, hash01 } from './worldTextures';

export type RegionId = 'coral' | 'swamp' | 'volcano' | 'ice';
export interface RegionDef {
  id: RegionId;
  name: string;
  /** World x range [from, to). The last region ends at the world width (then the loop starts again). */
  from: number;
  to: number;
  /** Water colors at the surface, the Reef band, the Deep band and the seabed (like WATER_STOPS). */
  water: string[];
}
export interface RegionsConfig {
  blend: number;
  list: RegionDef[];
}

export class Regions {
  constructor(readonly cfg: RegionsConfig, readonly width: number) {}

  wrap(x: number): number {
    return ((x % this.width) + this.width) % this.width;
  }

  /** The region at x. */
  at(x: number): RegionDef {
    const w = this.wrap(x);
    return this.cfg.list.find((r) => w >= r.from && w < r.to) ?? this.cfg.list[0];
  }

  /**
   * The region whose look to use at an art pixel, with a dithered blend across each border
   * (so ground and water change gradually, not with a straight line).
   */
  lookAt(x: number, px: number, py: number): RegionDef {
    const w = this.wrap(x);
    const half = this.cfg.blend / 2;
    for (let i = 0; i < this.cfg.list.length; i++) {
      const r = this.cfg.list[i];
      const next = this.cfg.list[(i + 1) % this.cfg.list.length];
      // The border between r and next is at r.to (the last one is at the loop's seam).
      const b = r.to;
      let d = w - b;
      if (d > this.width / 2) d -= this.width;
      if (d < -this.width / 2) d += this.width;
      if (Math.abs(d) < half) return 0.7 * bayer(px, py) + 0.3 * hash01(px, py) < (d + half) / (2 * half) ? next : r;
    }
    return this.at(w);
  }

  /** Borders between regions (world x), each with the regions on its left and right. */
  borders(): Array<{ x: number; left: RegionDef; right: RegionDef }> {
    return this.cfg.list.map((r, i) => ({ x: r.to % this.width, left: r, right: this.cfg.list[(i + 1) % this.cfg.list.length] }));
  }
}

/**
 * A spot (world x) for a fish of a species with these region weights. With `near`, it stays around
 * there (within `roam` px) as long as the region there suits it (the better it suits, the likelier);
 * otherwise it picks a region by weight x width and a spot inside it. Null if it lives nowhere.
 */
export function pickHomeX(
  regions: Regions,
  weight: (regionId: RegionId) => number,
  near?: number,
  roam = 1500,
  rand: () => number = Math.random,
): number | null {
  const list = regions.cfg.list;
  const w = list.map((r) => Math.max(0, weight(r.id)) * (r.to - r.from));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  if (near !== undefined) {
    const best = Math.max(...list.map((r) => weight(r.id)));
    if (best > 0 && rand() < weight(regions.at(near).id) / best) {
      // A spot nearby, as long as it doesn't cross into a region it likes less.
      const x = near + (rand() * 2 - 1) * roam;
      if (rand() < weight(regions.at(x).id) / best) return x;
    }
  }
  let k = rand() * total;
  for (let i = 0; i < list.length; i++) {
    k -= w[i];
    if (k <= 0 && w[i] > 0) return list[i].from + rand() * (list[i].to - list[i].from);
  }
  let last = list.length - 1;
  while (w[last] <= 0) last--;
  return list[last].from + rand() * (list[last].to - list[last].from);
}
