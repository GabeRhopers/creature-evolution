// Regions of the looping sea (left to right): the Coral Sea, the Mangrove Swamp and the Frozen Sea.
// Each region has its own water colors, ground, rocks and plants; neighbors blend over `blend` px.
// Pure data and math; numbers live in balance.json "regions".
import { bayer, hash01 } from './worldTextures';

export type RegionId = 'coral' | 'swamp' | 'ice';
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
