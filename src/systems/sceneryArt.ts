// Pixel art for scenery pieces (wrecks, submarine, whale bones, ruins, arch, vents, props,
// floating things) and far background layers. Each piece is painted on a small color grid,
// then outlined, so every piece shares one look. Endesga 32 colors only; seeded, so the
// same art every run. 1 texture pixel per art pixel.
import type Phaser from 'phaser';
import { add, bayer, C, canvas, px, rng } from './worldTextures';

type Col = string | null;

/** A small paint grid with simple shape tools. */
export class Grid {
  cells: Col[];
  constructor(readonly w: number, readonly h: number) {
    this.cells = new Array(w * h).fill(null);
  }
  get(x: number, y: number): Col {
    x = Math.round(x); y = Math.round(y);
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.cells[y * this.w + x];
  }
  dot(x: number, y: number, c: Col): void {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.cells[y * this.w + x] = c;
  }
  rect(x: number, y: number, w: number, h: number, c: Col): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: Col | ((x: number, y: number, u: number, v: number) => Col)): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const u = (x - cx) / rx, v = (y - cy) / ry;
        if (u * u + v * v <= 1) this.dot(x, y, typeof c === 'function' ? c(x, y, u, v) : c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: Col, thick = 1): void {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n, y = y0 + ((y1 - y0) * k) / n;
      for (let t = 0; t < thick; t++) this.dot(x + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? t : 0), y + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 0 : t), c);
    }
  }
  poly(pts: Array<[number, number]>, c: Col | ((x: number, y: number) => Col)): void {
    const ys = pts.map((p) => p[1]);
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = 0; x < this.w; x++) {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (inside) this.dot(x, y, typeof c === 'function' ? c(x, y) : c);
      }
  }
  /** Draw a 1-pixel outline around everything painted so far. */
  outline(c: string): void {
    const add: Array<[number, number]> = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
      }
    for (const [x, y] of add) this.dot(x, y, c);
  }
  /** Replace a color with another in a dither pattern, `amount` 0..1 of the pixels (shading). */
  shade(from: string, to: string, test: (x: number, y: number) => number): void {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) if (this.get(x, y) === from && bayer(x, y) < test(x, y)) this.dot(x, y, to);
  }
  toTexture(scene: Phaser.Scene, key: string): void {
    const [c, g] = canvas(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const col = this.cells[y * this.w + x];
        if (col) px(g, x, y, col);
      }
    add(scene, key, c);
  }
}

// ------------------------------------------------------------------ scenery pieces (origin: bottom center)

export const SCENERY_KINDS = ['galleon', 'wreck', 'submarine', 'whale', 'ruins', 'arch', 'vent', 'cannon', 'chest', 'helmet', 'anchor'] as const;
export type SceneryKind = (typeof SCENERY_KINDS)[number];

/** Art size in art pixels (w, h) per piece. */
export const SCENERY_SIZE: Record<SceneryKind, [number, number]> = {
  galleon: [170, 74],
  wreck: [80, 44],
  submarine: [96, 34],
  whale: [100, 36],
  ruins: [84, 52],
  arch: [92, 64],
  vent: [22, 30],
  cannon: [22, 10],
  chest: [14, 11],
  helmet: [14, 15],
  anchor: [16, 22],
};

const plank = (x: number, y: number) => ((y % 4 === 0) ? C.bark : (x + (y >> 2) * 5) % 13 === 0 ? C.bark : y % 4 === 1 ? C.clay : C.brown);

function galleon(g: Grid, r: () => number): void {
  const { w, h } = g;
  // Hull lying on the sand, tilted a little, broken open in the middle.
  const hull: Array<[number, number]> = [[4, h - 30], [w - 26, h - 34], [w - 4, h - 48], [w - 10, h - 30], [w - 30, h - 4], [24, h - 2], [8, h - 14]];
  g.poly(hull, (x, y) => plank(x, y));
  // A hole in the side, dark inside.
  g.ellipse(w * 0.45, h - 18, 13, 8, C.ink);
  g.ellipse(w * 0.45, h - 18, 13, 8, (x, y, u) => (bayer(x, y) < 0.3 + u * 0.3 ? C.bark : C.ink));
  // Portholes.
  for (let i = 0; i < 5; i++) { const x = 30 + i * 22; if (Math.abs(x - w * 0.45) > 16) g.ellipse(x, h - 24 + i * 0.6, 2, 2, C.navy); }
  // Deck rail and a raised stern cabin.
  g.rect(w - 44, h - 52, 30, 14, null);
  g.poly([[w - 46, h - 36], [w - 44, h - 54], [w - 12, h - 58], [w - 8, h - 46]], (x, y) => plank(x, y));
  for (let i = 0; i < 3; i++) g.rect(w - 40 + i * 9, h - 50, 4, 4, C.navy);
  g.line(6, h - 31, w - 26, h - 35, C.bark);
  // Broken masts: one standing stump, one snapped and leaning.
  g.line(w * 0.3, h - 32, w * 0.3 - 4, 4, C.brown, 3);
  g.line(w * 0.3 - 18, 18, w * 0.3 + 14, 16, C.bark, 2);
  g.line(w * 0.65, h - 34, w * 0.65 + 26, h - 70, C.brown, 3);
  // Torn sail scraps.
  g.poly([[w * 0.3 - 16, 20], [w * 0.3 + 12, 18], [w * 0.3 + 6, 34], [w * 0.3 - 12, 30]], (x, y) => (bayer(x, y) < 0.25 ? null : C.bone));
  // Seaweed and barnacles.
  for (let i = 0; i < 14; i++) {
    const x = 10 + r() * (w - 40);
    const top = h - 8 - Math.floor(r() * 18);
    for (let k = 0; k < 5 + r() * 8; k++) g.dot(x + Math.sin(k / 2) , top - k, k > 6 ? C.leafLight : C.leaf);
  }
  for (let i = 0; i < 30; i++) { const x = 8 + r() * (w - 30), y = h - 6 - r() * 20; if (g.get(x, y)) g.dot(x, y, C.stone); }
  g.outline(C.ink);
}

function wreck(g: Grid, r: () => number): void {
  const { w, h } = g;
  // The bow half of a ship, cut clean, nose up.
  g.poly([[2, h - 2], [w - 22, h - 2], [w - 4, h - 34], [w - 12, h - 36], [w - 28, h - 22], [6, h - 22]], (x, y) => plank(x, y));
  // Broken, jagged end on the left.
  for (let y = h - 22; y < h - 1; y++) g.rect(0, y, 3 + Math.floor(r() * 7), 1, null);
  g.rect(3, h - 20, 4, 17, C.ink);
  g.line(w - 30, h - 22, w - 36, 2, C.brown, 2);
  g.line(w - 46, 10, w - 24, 6, C.bark, 2);
  for (let i = 0; i < 3; i++) g.ellipse(22 + i * 14, h - 13, 2, 2, C.navy);
  for (let i = 0; i < 8; i++) { const x = 6 + r() * (w - 20); for (let k = 0; k < 4 + r() * 5; k++) g.dot(x, h - 3 - k, k > 3 ? C.leafLight : C.leaf); }
  g.outline(C.ink);
}

function submarine(g: Grid, r: () => number): void {
  const { w, h } = g;
  const cy = h - 11;
  g.ellipse(w / 2 - 2, cy, w / 2 - 8, 9, (_x, _y, _u, v) => (v < -0.4 ? C.stone : v > 0.45 ? C.slate : C.grey));
  // Conning tower and periscope.
  g.poly([[w / 2 - 10, cy - 8], [w / 2 - 8, cy - 18], [w / 2 + 8, cy - 18], [w / 2 + 12, cy - 8]], (_x, y) => (y < cy - 15 ? C.stone : C.grey));
  g.line(w / 2 + 2, cy - 18, w / 2 + 2, cy - 24, C.slate);
  g.line(w / 2 + 2, cy - 24, w / 2 + 6, cy - 24, C.slate);
  // Propeller and fins at the back (left), rust streaks, glowing portholes.
  g.poly([[4, cy - 7], [10, cy - 2], [10, cy + 2], [4, cy + 7]], C.slate);
  g.ellipse(2, cy, 2, 5, C.clay);
  for (let i = 0; i < 4; i++) g.ellipse(30 + i * 14, cy - 1, 2, 2, i === 1 ? C.yellow : C.navy);
  for (let i = 0; i < 10; i++) { const x = 14 + r() * (w - 30); for (let k = 0; k < 2 + r() * 5; k++) if (g.get(x, cy - 4 + k)) g.dot(x, cy - 4 + k, k ? C.clay : C.brown); }
  // Half sunk in the sand: the caller places it a little low.
  g.outline(C.ink);
}

function whale(g: Grid): void {
  const { w, h } = g;
  // Skull on the right (a long jaw), a spine along the sand, tall ribs you can swim between.
  g.poly([[w - 30, h - 2], [w - 30, h - 16], [w - 18, h - 18], [w - 1, h - 8], [w - 2, h - 3]], (_x, y) => (y < h - 13 ? C.white : C.bone));
  g.line(w - 26, h - 6, w - 4, h - 5, C.peach);
  g.ellipse(w - 22, h - 12, 2, 2, C.ink);
  g.line(w - 31, h - 4, 4, h - 3, C.bone, 3);
  for (let i = 0; i < 8; i++) {
    const x = 8 + i * 9;
    const tall = h - 8 - Math.round(Math.sin(((i + 0.5) / 8) * Math.PI) * 4) - 6;
    for (let k = 0; k <= 24; k++) {
      const a = Math.PI * 0.5 * (k / 24);
      const px0 = x + (1 - Math.cos(a)) * 5, py = h - 4 - Math.sin(a) * tall;
      g.dot(px0, py, C.bone);
      g.dot(px0 + 1, py, k % 6 === 0 ? C.peach : C.white);
      g.dot(px0 + 2, py, C.bone);
    }
  }
  g.outline(C.sandDark);
}

function ruins(g: Grid, r: () => number): void {
  const { w, h } = g;
  const stone = (x: number, y: number) => (y % 6 === 0 ? C.slate : (x + y) % 11 === 0 ? C.grey : C.stone);
  // A temple step, three columns (one broken), a fallen piece, and a statue head.
  g.rect(2, h - 6, w - 4, 6, null);
  g.poly([[2, h - 1], [w - 2, h - 1], [w - 4, h - 7], [4, h - 7]], stone);
  const col = (x: number, top: number, broken: boolean) => {
    g.rect(x, top, 7, h - 7 - top, null);
    for (let y = top; y < h - 7; y++) for (let i = 0; i < 7; i++) g.dot(x + i, y, i === 0 || i === 6 ? C.grey : i % 2 ? C.stone : C.mist);
    g.rect(x - 1, top - 2, 9, 2, C.mist);
    if (broken) for (let i = 0; i < 9; i++) g.dot(x - 1 + i, top - 3 + (i % 3 === 0 ? -1 : 0), r() < 0.5 ? null : C.stone);
  };
  col(8, 10, false); col(26, 20, true); col(60, 6, false);
  g.rect(6, 6, 64, 3, C.mist);
  g.rect(40, 4, 30, 3, null);
  // Statue head on the right, tipped over.
  g.ellipse(w - 14, h - 14, 9, 8, (_x, _y, u, _v) => (u > 0.3 ? C.grey : C.stone));
  g.rect(w - 18, h - 17, 3, 2, C.slate); g.rect(w - 11, h - 17, 3, 2, C.slate); g.rect(w - 15, h - 11, 4, 1, C.slate);
  // Fallen drum.
  g.ellipse(44, h - 10, 6, 4, C.stone);
  for (let i = 0; i < 10; i++) { const x = 4 + r() * (w - 8); for (let k = 0; k < 3 + r() * 6; k++) g.dot(x, h - 7 - k, k > 3 ? C.leafLight : C.leaf); }
  g.outline(C.navy);
}

function arch(g: Grid, r: () => number): void {
  const { w, h } = g;
  // A thick rock arch: two legs and a span. The opening is part of the art (transparent).
  const rock = (x: number, y: number) => (y < 6 ? C.stone : y < h * 0.55 ? C.grey : y < h * 0.65 ? (bayer(x, y) < 0.5 ? C.slate : C.grey) : C.slate);
  g.ellipse(w / 2, h, w / 2 - 1, h - 1, rock);
  g.ellipse(w / 2, h, w / 2 - 22, h - 22, null);
  for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h; if (g.get(x, y)) g.dot(x, y, C.navy); }
  for (let i = 0; i < 12; i++) { const x = 6 + r() * (w - 12); const y = h - Math.sqrt(Math.max(0, 1 - ((x - w / 2) / (w / 2)) ** 2)) * (h - 1); g.dot(x, y + 1, i % 3 ? C.leaf : C.pinkLight); }
  g.outline(C.navy);
}

function vent(g: Grid): void {
  const { w, h } = g;
  // A chimney of dark rock with a hot orange mouth.
  g.poly([[1, h - 1], [w - 1, h - 1], [w - 6, 4], [6, 4]], (x, y) => (bayer(x, y) < y / h * 0.7 ? C.navy : C.slate));
  g.ellipse(w / 2, 4, 5, 2, C.coralLight);
  g.ellipse(w / 2, 4, 3, 1, C.yellow);
  for (let y = 7; y < h - 3; y += 5) g.dot(w / 2 + ((y / 5) % 2 ? -3 : 3), y, C.orange);
  g.outline(C.ink);
}

function cannon(g: Grid): void {
  const { w, h } = g;
  g.poly([[2, h - 6], [w - 2, h - 8], [w - 2, h - 4], [2, h - 2]], (_x, y) => (y < h - 6 ? C.grey : C.slate));
  g.ellipse(4, h - 4, 3, 3, C.slate);
  g.ellipse(w - 2, h - 6, 1, 2, C.ink);
  g.ellipse(8, h - 2, 3, 2, C.brown);
  g.outline(C.ink);
}

function chest(g: Grid): void {
  const { w, h } = g;
  g.rect(1, 4, w - 2, h - 5, C.brown);
  g.ellipse(w / 2, 4, w / 2 - 1, 3, C.clay);
  g.rect(1, 4, w - 2, 1, C.gold);
  g.rect(w / 2 - 1, 5, 2, 3, C.gold);
  // Lid open a crack: gold inside.
  g.rect(3, 3, w - 6, 1, C.yellow);
  g.outline(C.bark);
}

function helmet(g: Grid): void {
  const { w, h } = g;
  g.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 2, (_x, _y, u, v) => (u < -0.3 && v < -0.3 ? C.yellow : C.gold));
  g.ellipse(w / 2 + 1, h / 2, 3, 3, C.navy);
  g.ellipse(w / 2 + 1, h / 2, 3, 3, (_x, _y, u, v) => (u < -0.2 && v < -0.2 ? C.blue : C.navy));
  g.rect(2, h - 3, w - 4, 2, C.orange);
  g.outline(C.bark);
}

function anchor(g: Grid): void {
  const { w, h } = g;
  g.line(w / 2, 3, w / 2, h - 3, C.grey, 2);
  g.ellipse(w / 2, 2, 2, 2, C.grey); g.ellipse(w / 2, 2, 1, 1, null);
  g.line(w / 2 - 5, 7, w / 2 + 5, 7, C.grey, 1);
  for (let k = 0; k <= 12; k++) { const a = Math.PI * (k / 12); g.dot(w / 2 + Math.cos(a) * 6, h - 4 + Math.sin(a) * 2, C.grey); }
  g.dot(1, h - 6, C.grey); g.dot(w - 2, h - 6, C.grey);
  g.outline(C.navy);
}

const PAINT: Record<SceneryKind, (g: Grid, r: () => number) => void> = { galleon, wreck, submarine, whale, ruins, arch, vent, cannon, chest, helmet, anchor };

export function makeScenery(scene: Phaser.Scene, key: string, kind: SceneryKind, seed = 1): void {
  if (scene.textures.exists(key)) return;
  const [w, h] = SCENERY_SIZE[kind];
  const g = new Grid(w, h);
  PAINT[kind](g, rng(seed));
  g.toTexture(scene, key);
}

// ------------------------------------------------------------------ floating at the surface (origin: center)

export const FLOAT_KINDS = ['rowboat', 'ball', 'bottle', 'weed'] as const;
export type FloatKind = (typeof FLOAT_KINDS)[number];

export function makeFloat(scene: Phaser.Scene, key: string, kind: FloatKind): void {
  if (scene.textures.exists(key)) return;
  if (kind === 'weed') {
    // A mat of golden sargassum: a lumpy raft at the surface with round air bladders, fronds hanging below.
    const W = 56, H = 22;
    const g = new Grid(W, H);
    const r = rng(77);
    for (let i = 0; i < 26; i++) {
      const cx = 3 + r() * (W - 6), cy = 3 + r() * 4;
      g.ellipse(cx, cy, 2 + r() * 3, 1.5 + r() * 1.5, (x, y) => (bayer(x, y) < 0.35 ? C.coral : C.gold));
    }
    for (let i = 0; i < 16; i++) {
      let x = 4 + r() * (W - 8);
      const len = 6 + Math.floor(r() * 12);
      for (let y = 6; y < 6 + len && y < H; y++) {
        x += (r() - 0.5) * 1.2;
        g.dot(x, y, y % 3 === 0 ? C.clay : C.gold);
      }
    }
    for (let i = 0; i < 22; i++) g.dot(2 + r() * (W - 4), 2 + r() * (H - 6), C.yellow);
    g.outline(C.brown);
    g.toTexture(scene, key);
  } else if (kind === 'rowboat') {
    const g = new Grid(36, 12);
    g.poly([[1, 3], [35, 3], [30, 11], [6, 11]], (x, y) => plank(x, y + 1));
    g.rect(2, 2, 32, 1, C.clay);
    g.line(10, 3, 22, 1, C.bark, 1);
    g.outline(C.bark);
    g.toTexture(scene, key);
  } else if (kind === 'ball') {
    const g = new Grid(10, 10);
    const cols = [C.red, C.white, C.blue, C.yellow];
    g.ellipse(4.5, 4.5, 4.4, 4.4, (x, y) => cols[Math.floor(((Math.atan2(y - 4.5, x - 4.5) + Math.PI) / (Math.PI * 2)) * 4) % 4]);
    g.dot(3, 2, C.white);
    g.outline(C.ink);
    g.toTexture(scene, key);
  } else {
    const g = new Grid(12, 6);
    g.rect(1, 1, 8, 4, C.leafLight);
    g.rect(9, 2, 2, 2, C.leaf);
    g.rect(3, 2, 4, 2, C.bone);
    g.dot(2, 1, C.white);
    g.outline(C.leafDark);
    g.toTexture(scene, key);
  }
}

// ------------------------------------------------------------------ far background layers (seamless sideways)

/** Far seamounts for the Reef: tall, faded peaks standing on the seabed. */
export function makeFarPeaks(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const r = rng(31);
  const [c, g] = canvas(w, h);
  const peaks = Array.from({ length: 5 }, (_, i) => ({ x: ((i + 0.3 + r() * 0.4) / 5) * w, hw: w * (0.06 + r() * 0.05), top: h * (0.05 + r() * 0.35) }));
  for (let x = 0; x < w; x++) {
    let top = h;
    for (const p of peaks) {
      for (const shift of [-w, 0, w]) {
        const d = Math.abs(x - p.x - shift);
        const t = d / (p.hw * 2.2);
        if (t < 1) top = Math.min(top, p.top + (h - p.top) * Math.pow(t, 1.6));
      }
    }
    for (let y = Math.round(top); y < h; y++) px(g, x, y, C.slate);
  }
  add(scene, key, c);
}

/** Far islands for the Shallows: low humps with tiny palms, sitting on the water line. */
export function makeFarIslands(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const r = rng(41);
  const [c, g] = canvas(w, h);
  for (let i = 0; i < 3; i++) {
    const cx = ((i + 0.5) / 3) * w + (r() - 0.5) * w * 0.15;
    const hw = 14 + r() * 16;
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const t = (x - cx) / hw;
      const top = Math.round(h - 2 - 5 * Math.sqrt(Math.max(0, 1 - t * t)));
      for (let y = top; y < h; y++) px(g, ((x % w) + w) % w, y, C.grey);
    }
    // A tiny palm.
    const tx = Math.round(cx + (r() - 0.5) * hw);
    for (let k = 0; k < 7; k++) px(g, tx + (k > 4 ? 1 : 0), h - 7 - k, C.grey);
    for (let k = -3; k <= 3; k++) px(g, tx + k + 1, h - 14 + Math.abs(k) / 2, C.grey);
  }
  add(scene, key, c);
}
