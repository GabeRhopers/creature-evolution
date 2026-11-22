// Pixel-art world textures made in code: water bands, sand, kelp, rocks.
//
// Every texture holds 1 pixel per art pixel, uses only the Endesga 32 palette
// and is rendered with smooth pixel art, so the world matches the creatures.
// Shapes are generated with a seeded random generator: the same art every run.
import type Phaser from 'phaser';

/** Endesga 32 colors used by the world. */
export const C = {
  ink: '#181425',
  navy: '#262b44',
  slate: '#3a4466',
  grey: '#5a6988',
  stone: '#8b9bb4',
  mist: '#c0cbdc',
  white: '#ffffff',
  deepBlue: '#124e89',
  blue: '#0099db',
  cyan: '#2ce8f5',
  sand: '#e4a672',
  sandDark: '#c28569',
  clay: '#b86f50',
  brown: '#733e39',
  leafDark: '#265c42',
  leaf: '#3e8948',
  leafLight: '#63c74d',
  coral: '#d77643',
  coralLight: '#f77622',
  pink: '#b55088',
  pinkLight: '#f6757a',
  red: '#a22633',
  orange: '#be4a2f',
  gold: '#feae34',
  yellow: '#fee761',
  bone: '#ead4aa',
  plum: '#68386c',
  bark: '#3e2731',
  peach: '#e8b796',
  sea: '#193c3e',
};

/** Seeded random numbers (mulberry32), so the generated art is the same every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 4x4 ordered-dither threshold (0..1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)];
/** A repeatable 0..1 noise value per pixel (for wide, stripe-free blends). */
export function hash01(x: number, y: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Water color at a depth share (0 = surface, 1 = seabed): flat bands with a
 * dithered blend where they meet. Bands line up with the Shallows, Reef and Deep.
 */
export const WATER_STOPS: Array<[number, string]> = [
  [0.0, C.blue],
  [0.4, C.deepBlue],
  [0.7, C.navy],
  [0.95, C.ink],
];
export function waterColor(depth: number, x: number, row: number, blend = 0.06, stops: Array<[number, string]> = WATER_STOPS): string {
  for (let i = stops.length - 1; i >= 0; i--) {
    const [at, col] = stops[i];
    if (depth >= at) {
      // Dither into the band above over `blend` of the depth just below a boundary.
      const into = (depth - at) / blend;
      if (i > 0 && into < 1 && bayer(x, row) > into) return stops[i - 1][1];
      return col;
    }
  }
  return stops[0][1];
}

/** A region's water colors (surface, Reef band, Deep band, seabed) as stops at the same depths. */
export function regionStops(colors: string[]): Array<[number, string]> {
  return WATER_STOPS.map(([at], i) => [at, colors[i] ?? WATER_STOPS[i][1]]);
}

/** A water strip that blends from one region's colors to the next, dithered sideways. */
export function makeWaterBlend(scene: Phaser.Scene, key: string, from: Array<[number, string]>, to: Array<[number, string]>, cols: number, rows: number): void {
  if (scene.textures.exists(key)) return;
  const [c, g] = canvas(cols, rows);
  for (let y = 0; y < rows; y++) {
    const d = y / (rows - 1);
    // Scattered (not ordered) dither, so a wide blend has no stripes.
    for (let x = 0; x < cols; x++) px(g, x, y, waterColor(d, x, y, 0.06, 0.7 * bayer(x, y) + 0.3 * hash01(x, y) < (x + 0.5) / cols ? to : from));
  }
  add(scene, key, c);
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
export function px(g: CanvasRenderingContext2D, x: number, y: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x, y, 1, 1);
}
export function add(scene: Phaser.Scene, key: string, c: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) return; // made once; scene restarts reuse it
  scene.textures.addCanvas(key, c)!.setSmoothPixelArt(true);
}

/** Water: `cols` x `rows` art pixels from surface to seabed (a plain image draws faster than a tile). */
export function makeWater(scene: Phaser.Scene, key: string, cols: number, rows: number, stops: Array<[number, string]> = WATER_STOPS): void {
  if (scene.textures.exists(key)) return;
  const [c, g] = canvas(cols, rows);
  // Each row is one band color, or a 4-pixel dither pattern repeated along the row.
  for (let y = 0; y < rows; y++) {
    const d = y / (rows - 1);
    const row = [0, 1, 2, 3].map((x) => waterColor(d, x, y, 0.06, stops));
    if (row.every((col) => col === row[0])) { g.fillStyle = row[0]; g.fillRect(0, y, cols, 1); continue; }
    for (let x = 0; x < cols; x++) px(g, x, y, row[x & 3]);
  }
  add(scene, key, c);
}

/** Sand: a 48x72 tile (seamless sideways, tall enough not to repeat downward) with ripples near the top, speckles and a few pebbles. */
export function makeSand(scene: Phaser.Scene, key: string): void {
  const W = 48, H = 72;
  const r = rng(7);
  const [c, g] = canvas(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let col = y < 2 ? C.sand : y < 8 ? (bayer(x, y) < (8 - y) / 8 ? C.sand : C.sandDark) : C.sandDark;
      if (y >= 3 && r() < 0.06) col = C.clay;
      px(g, x, y, col);
    }
  // Ripples: short light dashes near the surface of the sand.
  for (let i = 0; i < 7; i++) {
    const x0 = Math.floor(r() * W), y0 = 3 + Math.floor(r() * 4);
    for (let k = 0; k < 4; k++) px(g, (x0 + k) % W, y0 + (k === 0 || k === 3 ? 1 : 0), C.sand);
  }
  // Pebbles.
  for (let i = 0; i < 10; i++) {
    const x0 = Math.floor(r() * (W - 3)), y0 = 9 + Math.floor(r() * (H - 12));
    px(g, x0, y0, C.brown); px(g, x0 + 1, y0, C.brown); px(g, x0, y0 + 1, C.brown); px(g, x0 + 1, y0 + 1, C.clay);
  }
  add(scene, key, c);
}

/** One kelp strand: a wavy stem with leaves, `h` art pixels tall. Origin at its base. */
export function makeKelp(scene: Phaser.Scene, key: string, seed: number, h: number, dark: string, mid: string, light: string): void {
  const W = 14;
  const r = rng(seed);
  const [c, g] = canvas(W, h);
  const phase = r() * Math.PI * 2;
  const stemX = (y: number) => Math.round(W / 2 - 0.5 + Math.sin(y / 9 + phase) * 2);
  for (let y = 0; y < h; y++) {
    const x = stemX(y);
    px(g, x, y, mid);
    px(g, x + 1, y, dark);
    // Leaves every few pixels, alternating sides, shorter toward the top.
    if (y > 3 && y < h - 6 && (y + seed) % 6 === 0) {
      const side = ((y / 6) | 0) % 2 === 0 ? -1 : 1;
      const len = 2 + Math.round(3 * (y / h));
      for (let k = 1; k <= len; k++) {
        px(g, x + side * k + (side > 0 ? 1 : 0), y - Math.floor(k / 2), k === len ? light : mid);
        px(g, x + side * k + (side > 0 ? 1 : 0), y - Math.floor(k / 2) + 1, dark);
      }
    }
  }
  // A light tip.
  px(g, stemX(0), 0, light);
  add(scene, key, c);
}

/** A rock: a lumpy mound `w` x `h` art pixels with an outline, shading and a top highlight. */
export function makeRock(scene: Phaser.Scene, key: string, seed: number, w: number, h: number): void {
  const r = rng(seed);
  const [c, g] = canvas(w, h);
  const bumps = Array.from({ length: 4 }, () => 0.75 + r() * 0.25);
  const height = (x: number) => {
    const t = x / (w - 1);
    const base = Math.sin(Math.PI * t) ** 0.6;
    const b = bumps[Math.min(3, Math.floor(t * 4))];
    return Math.round((h - 1) * base * b);
  };
  const filled = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && h - 1 - y <= height(x);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!filled(x, y)) continue;
      const edge = !filled(x - 1, y) || !filled(x + 1, y) || !filled(x, y - 1);
      const top = !filled(x, y - 2);
      const shade = x > w * 0.6 || y > h * 0.75;
      px(g, x, y, edge ? C.navy : top ? C.stone : shade ? C.slate : C.grey);
      if (!edge && !top && r() < 0.05) px(g, x, y, C.slate);
    }
  add(scene, key, c);
}

/** A stepped light ray: a leaning band that fades with depth, in white (tinted/alpha'd by the caller). */
export function makeRay(scene: Phaser.Scene, key: string, w: number, h: number, lean: number): void {
  const [c, g] = canvas(w + lean, h);
  for (let y = 0; y < h; y++) {
    const x0 = Math.round((lean * y) / h);
    const fade = 1 - y / h;
    for (let x = 0; x < w; x++) if (bayer(x0 + x, y) < fade) px(g, x0 + x, y, C.white);
  }
  add(scene, key, c);
}

/** A far silhouette strip: low hills with kelp spikes, seamless across `w`. */
export function makeSilhouette(scene: Phaser.Scene, key: string, w: number, h: number): void {
  const r = rng(11);
  const [c, g] = canvas(w, h);
  const hill = (x: number) =>
    h * 0.35 + Math.sin((x / w) * Math.PI * 6) * h * 0.08 + Math.sin((x / w) * Math.PI * 14 + 1) * h * 0.05;
  for (let x = 0; x < w; x++) for (let y = Math.round(h - hill(x)); y < h; y++) px(g, x, y, C.navy);
  for (let i = 0; i < Math.round(w / 9); i++) {
    const x = Math.floor(r() * w), top = Math.round(h - hill(x) - (6 + r() * h * 0.45));
    const phase = r() * 6;
    for (let y = top; y < h - hill(x) + 1; y++) px(g, (x + Math.round(Math.sin(y / 6 + phase))) % w, y, C.navy);
  }
  add(scene, key, c);
}
