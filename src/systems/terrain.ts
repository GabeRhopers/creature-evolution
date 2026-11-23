// The shape of the sea: a ground line along the bottom (dunes, rocky ridges and tall
// seamounts that rise into the Reef) and a ceiling line under each island at the surface.
//
// Pure data and math (no Phaser): GameScene draws it, pushes swimmers out of it, and asks
// it where things may spawn. Solid = below the ground line, or above an island's underside.
// Layout comes from balance.json "terrain", so it is the same every run.

export interface SeamountDef {
  /** Center x in world px. */
  x: number;
  width: number;
  /** Top of the plateau as a share of the water (0 = surface, 1 = seabed). */
  top: number;
}
export interface RidgeDef {
  x: number;
  width: number;
  /** Height above the seabed in world px. */
  height: number;
}
export interface IslandDef {
  x: number;
  width: number;
  /** Look: sandy island with palms (default), a mangrove clump, or an iceberg. */
  style?: 'sand' | 'mangrove' | 'iceberg' | 'volcano';
  /** How far the island's sandbank reaches below the surface, in world px. */
  depth: number;
}
export interface TerrainConfig {
  dunes: { amplitude: number; wavelength: number };
  ridges: RidgeDef[];
  seamounts: SeamountDef[];
  islands: IslandDef[];
  /** Mangrove roots hang this far below an island's sandbank (a hiding place, not solid). */
  rootsDepth: number;
}

/** What makes the ground at one spot (drives the art). */
export type GroundKind = 'sand' | 'ridge' | 'seamount';

/** Samples every STEP world px (one art pixel at WORLD_PX = 4). */
const STEP = 4;

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** Small deterministic wobble, -1..1, so edges look natural without a random generator. */
const wobble = (x: number, seed: number) =>
  0.6 * Math.sin(x / 37 + seed) + 0.4 * Math.sin(x / 11.3 + seed * 2.1);

export class Terrain {
  readonly width: number;
  readonly surfaceY: number;
  readonly seabedTop: number;
  private ground: Float32Array;
  private ceil: Float32Array;
  private kinds: Uint8Array;
  /** Highest point of the ground line (smallest y). */
  readonly highestGround: number;

  constructor(readonly cfg: TerrainConfig, width: number, surfaceY: number, seabedTop: number) {
    this.width = width;
    this.surfaceY = surfaceY;
    this.seabedTop = seabedTop;
    const n = Math.ceil(width / STEP) + 2;
    this.ground = new Float32Array(n);
    this.ceil = new Float32Array(n);
    this.kinds = new Uint8Array(n);
    const waterH = seabedTop - surfaceY;
    let highest = seabedTop;
    // The sea loops: x and x + width are the same place, so every shape uses the
    // shortest distance around the loop, and the dune waves fit a whole number of times.
    const near = (x: number, c: number) => {
      const d = Math.abs(x - c) % width;
      return Math.min(d, width - d);
    };
    const d = cfg.dunes;
    const waves = Math.max(1, Math.round(width / d.wavelength));
    for (let i = 0; i < n; i++) {
      const x = i * STEP;
      // Dunes: gentle sand waves.
      const a = (x / width) * Math.PI * 2 * waves;
      const dune = d.amplitude * (0.55 + 0.3 * Math.sin(a) + 0.15 * Math.sin(a * 3 + 1));
      let h = dune;
      let kind = 0;
      for (const r of cfg.ridges) {
        const t = near(x, r.x) / (r.width / 2);
        if (t >= 1) continue;
        const v = r.height * (1 - smooth(0.15, 1, t)) * (0.9 + 0.1 * wobble(x, r.x));
        if (v > h) { h = v; kind = 1; }
      }
      for (const s of cfg.seamounts) {
        const t = near(x, s.x) / (s.width / 2);
        if (t >= 1) continue;
        const full = seabedTop - (surfaceY + waterH * s.top);
        // A plateau with a bumpy top and steep, slightly stepped sides.
        const v = full * (1 - smooth(0.32, 1, t)) + 14 * (0.6 * Math.sin(x / 70 + s.x) + 0.4 * Math.sin(x / 29 + s.x * 2.1)) * (1 - t);
        if (v > h) { h = v; kind = 2; }
      }
      this.ground[i] = seabedTop - h;
      this.kinds[i] = kind;
      highest = Math.min(highest, this.ground[i]);
      // Islands: the sandbank under each island is solid down to its depth.
      let c = 0;
      for (const isl of cfg.islands) {
        const t = near(x, isl.x) / (isl.width / 2);
        if (t >= 1) continue;
        c = Math.max(c, isl.depth * Math.pow(1 - t * t, 0.7) * (0.95 + 0.05 * wobble(x, isl.x)));
      }
      this.ceil[i] = c > 0 ? surfaceY + c : -Infinity;
    }
    this.highestGround = highest;
  }

  /** Any x folded into the loop [0, width). */
  wrap(x: number): number {
    return ((x % this.width) + this.width) % this.width;
  }

  private sample(arr: Float32Array, x: number): number {
    const f = this.wrap(x) / STEP;
    const i = Math.floor(f);
    const a = arr[i], b = arr[Math.min(arr.length - 1, i + 1)];
    if (!isFinite(a) || !isFinite(b)) return isFinite(a) ? a : b;
    return a + (b - a) * (f - i);
  }

  /** The ground line's y at x (the seabed, a dune, a ridge or a seamount). */
  groundAt(x: number): number {
    return this.sample(this.ground, x);
  }
  /** The underside of an island at x, or -Infinity where there is no island. */
  ceilAt(x: number): number {
    return this.sample(this.ceil, x);
  }
  kindAt(x: number): GroundKind {
    const k = this.kinds[Math.round(this.wrap(x) / STEP)];
    return k === 2 ? 'seamount' : k === 1 ? 'ridge' : 'sand';
  }
  /** Ground slope (dy/dx) at x. */
  slopeAt(x: number): number {
    return (this.groundAt(x + 8) - this.groundAt(x - 8)) / 16;
  }

  /** True if a circle of radius r at (x, y) overlaps the ground or an island. */
  isSolid(x: number, y: number, r = 0): boolean {
    return y + r > this.groundAt(x) || y - r < this.ceilAt(x);
  }

  /**
   * Push a circle out of the terrain. Returns the corrected position and the outward normal,
   * or null when it does not touch anything.
   */
  resolve(x: number, y: number, r: number): { x: number; y: number; nx: number; ny: number } | null {
    const g = this.groundAt(x);
    const over = y + r - g;
    if (over > 0) {
      const s = this.slopeAt(x);
      const len = Math.hypot(s, 1);
      const nx = s / len, ny = -1 / len;
      // Deep inside (spawned or pushed in): lift straight to the surface of the ground.
      if (over / len > r * 3) return { x, y: g - r, nx: 0, ny: -1 };
      return { x: x + nx * (over / len), y: y + ny * (over / len), nx, ny };
    }
    const c = this.ceilAt(x);
    const under = c - (y - r);
    if (isFinite(c) && under > 0) {
      const s = (this.ceilAt(x + 8) - this.ceilAt(x - 8)) / 16;
      const len = Math.hypot(s, 1);
      const nx = -s / len, ny = 1 / len;
      if (under / len > r * 3) return { x, y: c + r, nx: 0, ny: 1 };
      return { x: x + nx * (under / len), y: y + ny * (under / len), nx, ny };
    }
    return null;
  }

  /** A gentle steer away from nearby terrain (for AI), within `margin` px. */
  avoid(x: number, y: number, margin = 220): [number, number] {
    let ax = 0, ay = 0;
    const g = this.groundAt(x);
    const below = g - y;
    if (below < margin) {
      const k = 1 - Math.max(0, below) / margin;
      const s = this.slopeAt(x);
      ay -= k;
      ax += Math.max(-1, Math.min(1, s)) * k;
    }
    // Walls ahead or behind: look sideways.
    for (const dx of [-margin * 0.6, margin * 0.6]) {
      if (this.groundAt(x + dx) < y + 30) ax -= Math.sign(dx) * 0.8;
    }
    const c = this.ceilAt(x);
    if (isFinite(c) && y - c < margin) ay += 1 - Math.max(0, y - c) / margin;
    return [ax, ay];
  }

  /** Mangrove root hiding places under each island (world rectangles: x, y, w, h). */
  rootZones(): Array<[number, number, number, number]> {
    // Icebergs and volcanoes have no roots; mangroves have a deep tangle.
    return this.cfg.islands.filter((isl) => isl.style !== 'iceberg' && isl.style !== 'volcano').map((isl) => {
      const w = isl.width * 0.6;
      const roots = this.cfg.rootsDepth * (isl.style === 'mangrove' ? 1.4 : 1);
      return [isl.x - w / 2, this.surfaceY + isl.depth * 0.55, w, isl.depth * 0.45 + roots];
    });
  }

  /** Flat-enough tops of the seamounts, for coral gardens (center x, half width, y). */
  plateaus(): Array<{ x: number; half: number; y: number }> {
    return this.cfg.seamounts.map((s) => ({ x: s.x, half: s.width * 0.3, y: this.groundAt(s.x) }));
  }
}
