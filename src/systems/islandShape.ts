// Islands above the water, rebuilt from zero (Rhopers, Nov 27). Pure (unit tested in tests/islands.test.ts).
//
// Before, every island was described three ways that did not agree: the drawing (terrainArt), the underside line you bump into
// while swimming (Terrain.ceilAt) and a hand-written guess of where you can stand (GameScene.landTopAt, about 80% of the drawing,
// a flat invisible ledge on mangroves, no iceberg jags), and nothing was solid on an island's sides while in the air, so a leap
// could fly through an iceberg or a volcano. Now ONE profile per island says how many art rows of solid land stand above the water
// in each art column (`land`). The drawing paints its body from it (terrainArt), and `IslandLand` builds one lookup for the
// whole sea from the same profiles: the land's top at any x, used for landing, walking and walls. The underwater part stays the
// Terrain ceiling line, which the drawing already follows exactly.

export type IslandStyle = 'sand' | 'mangrove' | 'iceberg' | 'volcano' | 'cave';
export interface IslandLike {
  x: number;
  width: number;
  depth: number;
  style?: IslandStyle;
}

/** The share of the half-width the volcano's cone reaches (the rest is a low shore). */
export const VOLCANO_REACH = 0.6;

/** The rows a cave rock rises above the water at u (0 center, 1 edge). */
export function caveRockRows(u: number, aboveRows: number): number {
  return u >= 1 ? 0 : Math.min(7, aboveRows - 2) * Math.pow(1 - u * u, 0.6);
}

/** The height (art rows) of a volcano island's cone at u (0 center, 1 at its reach). */
export function volcanoRows(u: number, aboveRows: number): number {
  if (u >= 1) return 0;
  const top = aboveRows - 3;
  // A steep cone with a small crater at the top.
  const cone = top * Math.pow(1 - u, 0.9);
  return u < 0.1 ? cone - 2 * (1 - u / 0.1) : cone;
}

/** A small, repeatable number in [0, 1) for column `i` of island `seed` (the iceberg's jagged peak). */
export function jag(i: number, seed: number): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export interface IslandProfile {
  /** Index of the island in balance.json. */
  index: number;
  style: IslandStyle;
  /** Center x (world). */
  x: number;
  /** World x of the drawing's first column. */
  left: number;
  cols: number;
  /** Art rows of the drawing above the waterline. */
  aboveRows: number;
  /** Solid art rows above the water in each column (0 = none: open water, or only trees and leaves). */
  land: Int16Array;
}

/** Columns of an island drawing (the art adds 2 columns of margin on each side). */
export const islandCols = (width: number, P: number) => Math.ceil(width / P) + 4;

/**
 * How much solid land each column of an island has above the water. The same shape the drawing paints: a sand hump, a cave
 * rock's mossy hump, an iceberg's jagged peak, a volcano's cone, and a mangrove's mud bank (its trees are not solid).
 */
export function islandProfile(isl: IslandLike, index: number, P: number, aboveRows: number, seed = 60 + index): IslandProfile {
  const cols = islandCols(isl.width, P);
  const half = cols / 2;
  const style: IslandStyle = isl.style ?? 'sand';
  const land = new Int16Array(cols);
  for (let x = 0; x < cols; x++) {
    let h = 0;
    if (style === 'sand') {
      const u = Math.abs(x - half) / (half * 0.8);
      h = u >= 1 ? 0 : Math.round(Math.min(8, aboveRows - 2) * Math.pow(1 - u * u, 0.6));
    } else if (style === 'cave') {
      h = Math.round(caveRockRows(Math.abs(x - half) / (half * 0.8), aboveRows));
    } else if (style === 'iceberg') {
      const u = Math.abs(x - half) / (half * 0.85);
      h = u >= 1 ? 0 : Math.round((aboveRows - 3) * Math.pow(1 - u, 1.1) + jag(x, seed) * 2);
    } else if (style === 'volcano') {
      h = Math.round(volcanoRows(Math.abs(x - half) / (half * VOLCANO_REACH), aboveRows));
    } else {
      // Mangrove: a low mud bank between the roots, two rows above the water.
      const u = Math.abs(x - half) / (half * 0.8);
      h = u >= 1 ? 0 : 2;
    }
    land[x] = Math.max(0, Math.min(aboveRows - 1, h));
  }
  return { index, style, x: isl.x, left: isl.x - (cols * P) / 2, cols, aboveRows, land };
}

/**
 * The land of every island, as one lookup over the whole (looping) sea: the y of the land's top in each art column, or Infinity
 * where there is none. Where two islands overlap (the Trench's cave roof), the higher land wins.
 */
export class IslandLand {
  readonly profiles: IslandProfile[];
  private top: Float32Array;
  private n: number;

  constructor(islands: IslandLike[], readonly worldW: number, readonly surfaceY: number, readonly P: number, readonly aboveRows: number) {
    this.profiles = islands.map((isl, i) => islandProfile(isl, i, P, aboveRows));
    this.n = Math.ceil(worldW / P);
    this.top = new Float32Array(this.n).fill(Infinity);
    for (const pr of this.profiles) {
      for (let c = 0; c < pr.cols; c++) {
        const h = pr.land[c];
        if (h <= 0) continue;
        const i = this.col(pr.left + c * P + P / 2);
        const y = surfaceY - h * P;
        if (y < this.top[i]) this.top[i] = y;
      }
    }
  }

  private col(x: number): number {
    const w = ((x % this.worldW) + this.worldW) % this.worldW;
    return Math.min(this.n - 1, Math.floor(w / this.P));
  }

  /** The top of the land at x, or null over water. */
  topAt(x: number): number | null {
    const y = this.top[this.col(x)];
    return isFinite(y) ? y : null;
  }

  /** The highest land top under a body from x0 to x1, or null if all of it is over water. */
  highestTop(x0: number, x1: number): number | null {
    let best = Infinity;
    for (let x = x0; x <= x1 + 0.001; x += this.P) best = Math.min(best, this.top[this.col(x)]);
    best = Math.min(best, this.top[this.col(x1)]);
    return isFinite(best) ? best : null;
  }

  /** Is (x, y) inside an island's land above the water? */
  solidAt(x: number, y: number): boolean {
    const t = this.top[this.col(x)];
    return isFinite(t) && y >= t && y <= this.surfaceY;
  }
}
