// Pixel art for the terrain: the ground (sand dunes, rocky ridges, seamounts), islands
// with palm trees and mangrove roots, and coral garden pieces. Same rules as worldTextures:
// 1 texture pixel per art pixel, Endesga 32 colors, seeded so it is the same every run.
import type Phaser from 'phaser';
import { add, bayer, C, canvas, px, rng } from './worldTextures';
import type { Terrain } from './terrain';
import type { RegionId, Regions } from './regions';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Ground colors per region: sand (top, body, speckle), rock (outline, top, body, deep), and moss on tops. */
const GROUND: Record<RegionId, { sand: string; sandDark: string; speck: string; speck2: string; outline: string; rockTop: string; rock: string; rockDeep: string; moss: string[] }> = {
  coral: { sand: C.sand, sandDark: C.sandDark, speck: C.clay, speck2: C.brown, outline: C.navy, rockTop: C.stone, rock: C.grey, rockDeep: C.slate, moss: [C.leaf, C.pinkLight] },
  swamp: { sand: C.clay, sandDark: C.brown, speck: C.bark, speck2: C.leafDark, outline: C.ink, rockTop: C.leaf, rock: C.bark, rockDeep: C.ink, moss: [C.leafDark, C.leaf] },
  volcano: { sand: C.slate, sandDark: C.navy, speck: C.grey, speck2: C.orange, outline: C.ink, rockTop: C.grey, rock: C.slate, rockDeep: C.navy, moss: [C.orange, C.gold] },
  sargasso: { sand: C.sand, sandDark: C.sandDark, speck: C.bone, speck2: C.gold, outline: C.navy, rockTop: C.stone, rock: C.grey, rockDeep: C.slate, moss: [C.gold, C.coral] },
  trench: { sand: C.slate, sandDark: C.navy, speck: C.grey, speck2: C.cyan, outline: C.ink, rockTop: C.grey, rock: C.navy, rockDeep: C.ink, moss: [C.cyan, C.plum] },
  kelp: { sand: C.sandDark, sandDark: C.clay, speck: C.brown, speck2: C.plum, outline: C.ink, rockTop: C.stone, rock: C.grey, rockDeep: C.slate, moss: [C.pink, C.leaf] },
  ice: { sand: C.white, sandDark: C.mist, speck: C.stone, speck2: C.cyan, outline: C.slate, rockTop: C.white, rock: C.mist, rockDeep: C.stone, moss: [C.cyan, C.white] },
};

/** Widest ground image, in art pixels (iPads can't load very wide textures). */
const CHUNK = 1024;

/**
 * The ground as a row of images (chunks of `CHUNK` art pixels): `P` world px per art pixel, from just
 * above the highest point down to the bottom of the world. Colors follow the region (sand, mud or
 * snow; grey, mossy or icy rock), blending across region borders. Returns the top edge and the chunks.
 */
export function makeGround(scene: Phaser.Scene, prefix: string, t: Terrain, regions: Regions, worldH: number, P: number): { chunks: Array<{ key: string; x: number; y: number }> } {
  const totalCols = Math.ceil(t.width / P);
  const chunks: Array<{ key: string; x: number; y: number }> = [];
  const pals = Object.fromEntries(
    Object.entries(GROUND).map(([id, g]) => [id, Object.fromEntries(Object.entries(g).map(([k, v]) => [k, Array.isArray(v) ? v.map(hex) : hex(v)]))]),
  ) as Record<RegionId, Record<string, [number, number, number] & [number, number, number][]>>;
  for (let c0 = 0; c0 < totalCols; c0 += CHUNK) {
    const key = `${prefix}_${c0}`;
    const cols = Math.min(CHUNK, totalCols - c0);
    // Each chunk starts just above its own highest ground (most of the sea floor is low sand, so this keeps
    // the images small: a third of the memory of one shared top). Rows are aligned to 8 so dithers line up.
    let high = Infinity;
    for (let i = -1; i <= cols; i++) high = Math.min(high, t.groundAt((c0 + i) * P + P / 2));
    const top = Math.max(0, (Math.floor(high / P / 8) - 1) * 8);
    const rows = Math.ceil(worldH / P) - top;
    const sandLine = (t.seabedTop + 6) / P - top;
    chunks.push({ key, x: c0 * P, y: top * P });
    if (scene.textures.exists(key)) continue;
    const [c, g] = canvas(cols, rows);
    const img = g.createImageData(cols, rows);
    const r = rng(21 + c0);
    const tops = Float32Array.from({ length: cols + 2 }, (_, i) => Math.round(t.groundAt((c0 + i - 1) * P + P / 2) / P - top));
    const put = (x: number, y: number, rgb: [number, number, number]) => {
      const i = (y * cols + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    };
    for (let x = 0; x < cols; x++) {
      const wx = (c0 + x) * P + P / 2;
      const gy = Math.max(0, tops[x + 1]);
      const kind = t.kindAt(wx);
      const rock = kind !== 'sand';
      for (let y = gy; y < rows; y++) {
        const pal = pals[regions.lookAt(wx, c0 + x, y).id];
        const d = y - gy;
        // Exposed side faces of steep rock: the neighbor column starts lower.
        const side = rock && (y < tops[x] || y < tops[x + 2]);
        if (!rock || y > sandLine) {
          // Sand (mud, snow): light top, dithered into the darker shade, speckles.
          const sd = rock ? y - sandLine : d;
          let p = sd < 2 ? pal.sand : sd < 8 ? (bayer(x, y) < (8 - sd) / 8 ? pal.sand : pal.sandDark) : pal.sandDark;
          if (sd >= 3 && r() < 0.05) p = pal.speck;
          if (sd >= 9 && r() < 0.008) p = pal.speck2;
          put(x, y, p);
          continue;
        }
        if (d === 0 || side) { put(x, y, pal.outline); continue; }
        // Rock: a light top, then flat bands that darken toward the seabed, with short dithered blends.
        const band = (a: number, b: number) => (d - a) / (b - a);
        let p: [number, number, number];
        if (d <= 2) p = pal.rockTop;
        else if (d < 36) p = pal.rock;
        else if (d < 48) p = bayer(x, y) < band(36, 48) ? pal.rockDeep : pal.rock;
        else p = pal.rockDeep;
        // Strata: short dark ledges.
        if (d > 6 && (y + (x >> 4) * 7) % 29 === 0 && ((x >> 2) & 3) !== 0) p = d < 42 ? pal.rockDeep : pal.outline;
        if (d > 3 && r() < 0.012) p = d < 42 ? pal.rockDeep : pal.outline;
        // Moss, tiny coral or frost on the tops of seamounts.
        if (kind === 'seamount' && d <= 3 && r() < 0.18) {
          const moss = pal.moss as unknown as Array<[number, number, number]>;
          p = r() < 0.6 ? moss[0] : moss[1];
        }
        put(x, y, p);
      }
    }
    g.putImageData(img, 0, 0);
    add(scene, key, c);
  }
  return { chunks };
}

/** An island: sand hump and palm trees above the water, a sandbank and mangrove roots below. */
export function makeIsland(scene: Phaser.Scene, key: string, t: Terrain, cx: number, width: number, depth: number, roots: number, above: number, P: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(width / P) + 4;
  const aboveRows = Math.floor(above / P);
  const rows = aboveRows + Math.ceil((depth + roots) / P) + 2;
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  const left = cx - (cols * P) / 2;
  const half = cols / 2;
  // Underwater sandbank: follows the terrain's ceiling line exactly.
  const bottom = (x: number) => {
    const y = t.ceilAt(left + x * P + P / 2);
    return isFinite(y) ? Math.round((y - t.surfaceY) / P) : -1;
  };
  for (let x = 0; x < cols; x++) {
    const b = bottom(x);
    if (b < 0) continue;
    for (let y = 0; y <= b; y++) {
      const fy = aboveRows + y;
      // Lit from above: sand at the top, darker toward the shaded underside.
      const edge = bottom(x - 1) < y || bottom(x + 1) < y;
      const u = y / Math.max(1, b);
      let col = y < 3 ? C.sand : u < 0.45 ? (bayer(x, y) < u ? C.sandDark : C.sand) : u < 0.8 ? (bayer(x, y) < (u - 0.45) / 0.35 ? C.clay : C.sandDark) : bayer(x, y) < (u - 0.8) / 0.2 ? C.brown : C.clay;
      if (y > 3 && u < 0.7 && r() < 0.04) col = C.clay;
      px(g, x, fy, edge ? C.brown : col);
    }
    // Hanging algae and stuck shells along the underside.
    if (b > 2 && r() < 0.12) {
      const len = 2 + Math.floor(r() * 5);
      for (let k = 1; k <= len; k++) px(g, x, aboveRows + b + k, k === len ? C.leafLight : C.leaf);
    } else if (b > 2 && r() < 0.05) px(g, x, aboveRows + b - 1, C.bone);
  }
  // Starfish and urchins on the sandbank.
  const dot = (x: number, y: number, colr: string) => { if (x >= 0 && x < cols && y >= 0 && y < rows) px(g, x, y, colr); };
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(half * 0.5 + r() * half);
    const b = bottom(x);
    if (b < 4) continue;
    const y = aboveRows + b - 2;
    if (i % 2 === 0) {
      dot(x, y, C.coralLight); dot(x - 1, y, C.coral); dot(x + 1, y, C.coral); dot(x, y - 1, C.coral); dot(x - 1, y + 1, C.coral); dot(x + 1, y + 1, C.coral);
    } else {
      dot(x, y, C.plum); dot(x + 1, y, C.plum);
      for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [-1, -1], [2, -1]]) dot(x + dx, y + dy, C.bark);
    }
  }
  // Mangrove roots: arching strands from the sandbank down into the water.
  const nRoots = Math.max(4, Math.round(cols / 9));
  for (let i = 0; i < nRoots; i++) {
    const x0 = Math.round(half * 0.45 + r() * half * 1.1);
    const b = bottom(x0);
    if (b < 2) continue;
    const len = Math.round((roots / P) * (0.5 + r() * 0.5));
    const lean = (r() - 0.5) * 0.9;
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + lean * k + Math.sin(k / 5 + i) * 1.2);
      const y = aboveRows + b + k;
      dot(x, y, k > len - 2 ? C.clay : C.brown);
      dot(x + 1, y, C.bark);
    }
  }
  // Above water: a sand hump with palm trees.
  const humpH = Math.min(8, aboveRows - 2);
  const hump = (x: number) => {
    const u = Math.abs(x - half) / (half * 0.8);
    return u >= 1 ? 0 : Math.round(humpH * Math.pow(1 - u * u, 0.6));
  };
  for (let x = 0; x < cols; x++) {
    const h = hump(x);
    for (let k = 0; k < h; k++) px(g, x, aboveRows - 1 - k, k === h - 1 ? C.bone : k > h - 4 ? C.sand : C.sandDark);
    if (h > 0) px(g, x, aboveRows - h - 1, C.clay);
  }
  for (let x = 0; x < cols; x++) if (hump(x) > 0) px(g, x, aboveRows - hump(x) - 1, C.sandDark);
  // Water line across the island's base.
  for (let x = 0; x < cols; x++) if (bottom(x) >= 0 && bayer(x, 0) < 0.5) px(g, x, aboveRows, C.cyan);
  const palms = width > 560 ? 2 : 1;
  for (let i = 0; i < palms; i++) {
    const bx = Math.round(half + (palms === 1 ? 0 : (i === 0 ? -1 : 1) * half * 0.28));
    const baseY = aboveRows - hump(bx) - 1;
    const h = Math.min(baseY - 6, 11 + Math.floor(r() * 3));
    const lean = i === 0 ? -1 : 1;
    let tx = bx, ty = baseY;
    for (let k = 0; k < h; k++) {
      tx = bx + Math.round(lean * (k * k) / (h * 3));
      ty = baseY - k;
      dot(tx, ty, k % 3 === 0 ? C.bark : C.brown);
      dot(tx + 1, ty, C.clay);
    }
    // Fronds: drooping arcs.
    for (const dir of [-1, 1]) {
      for (const lift of [0, 2]) {
        for (let k = 1; k <= 6; k++) {
          const fx = tx + dir * k + (dir > 0 ? 1 : 0);
          const fy = ty - lift + Math.round((k * k) / 9);
          dot(fx, fy, k > 4 ? C.leafLight : C.leaf);
          dot(fx, fy + 1, C.leafDark);
        }
      }
    }
    dot(tx, ty + 1, C.brown); dot(tx + 1, ty + 1, C.bark);
  }
  add(scene, key, c);
}

/** A soft, dithered shadow below an island (ink, faded by the caller's alpha). */
export function makeShadow(scene: Phaser.Scene, key: string, w: number, h: number): void {
  if (scene.textures.exists(key)) return;
  const [c, g] = canvas(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = Math.abs(x - w / 2) / (w / 2);
      const fade = (1 - y / h) * (1 - u * u);
      if (bayer(x, y) < fade) px(g, x, y, C.ink);
    }
  add(scene, key, c);
}

/** Coral garden pieces. Origin at the base. */
export const CORAL_KINDS = ['brain', 'branch', 'fan', 'anemone', 'sponge'] as const;
export type CoralKind = (typeof CORAL_KINDS)[number];

export function makeCoral(scene: Phaser.Scene, key: string, kind: CoralKind, seed: number): void {
  if (scene.textures.exists(key)) return;
  const r = rng(seed);
  const size: Record<CoralKind, [number, number]> = { brain: [14, 9], branch: [17, 18], fan: [18, 20], anemone: [12, 11], sponge: [11, 15] };
  const [w, h] = size[kind];
  const [c, g] = canvas(w, h);
  const dot = (x: number, y: number, col: string) => { if (x >= 0 && x < w && y >= 0 && y < h) px(g, Math.round(x), Math.round(y), col); };
  if (kind === 'brain') {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const u = (x - (w - 1) / 2) / (w / 2), v = (h - 1 - y) / h;
        if (u * u + v * v * 1.1 > 1) continue;
        const edge = u * u + v * v * 1.1 > 0.75;
        const groove = Math.sin(x * 1.3 + Math.sin(y * 1.7) * 2) > 0.55;
        dot(x, y, edge ? C.pink : groove ? C.pink : y < h * 0.35 ? C.peach : C.pinkLight);
      }
  } else if (kind === 'branch') {
    const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
      for (let k = 0; k < len; k++) {
        x += Math.cos(ang); y -= Math.sin(ang);
        dot(x, y, C.coral); dot(x + 1, y, C.clay);
      }
      dot(x, y, C.coralLight);
      if (depth > 0) {
        branch(x, y, ang + 0.5 + r() * 0.3, len * 0.7, depth - 1);
        branch(x, y, ang - 0.5 - r() * 0.3, len * 0.7, depth - 1);
      }
    };
    branch(w / 2, h - 1, Math.PI / 2, 6, 2);
  } else if (kind === 'fan') {
    const cx = w / 2, base = h - 1;
    for (let a = 0.25; a <= Math.PI - 0.25; a += 0.18)
      for (let k = 2; k < h - 2; k++) dot(cx + Math.cos(a) * k * 0.95, base - Math.sin(a) * k, k > h - 5 ? C.pinkLight : C.pink);
    for (let k = 4; k < h - 2; k += 3)
      for (let a = 0.25; a <= Math.PI - 0.25; a += 0.05) dot(cx + Math.cos(a) * k * 0.95, base - Math.sin(a) * k, C.plum);
    for (let y = base; y > base - 3; y--) dot(cx, y, C.plum);
  } else if (kind === 'anemone') {
    for (let x = 2; x < w - 2; x++) { dot(x, h - 1, C.red); dot(x, h - 2, C.red); dot(x, h - 3, x % 2 ? C.red : C.pink); }
    for (let i = 0; i < 7; i++) {
      const x0 = 2 + (i * (w - 4)) / 6;
      const lean = (i - 3) * 0.35;
      for (let k = 0; k < 6 + (i % 2); k++) dot(x0 + lean * k * 0.4, h - 4 - k, k > 4 ? C.white : C.pinkLight);
    }
  } else {
    for (const [x0, th] of [[1, h - 3], [5, h - 1], [8, h - 6]] as Array<[number, number]>) {
      for (let y = h - 1; y > h - 1 - th; y--) { dot(x0, y, C.gold); dot(x0 + 1, y, C.gold); dot(x0 + 2, y, C.orange); }
      dot(x0 + 1, h - th, C.orange); dot(x0, h - th, C.yellow);
    }
  }
  add(scene, key, c);
}

/** Shared: the underside line of an island (rows below the surface) at art column x, or -1. */
function undersideOf(t: Terrain, left: number, P: number) {
  return (x: number) => {
    const y = t.ceilAt(left + x * P + P / 2);
    return isFinite(y) ? Math.round((y - t.surfaceY) / P) : -1;
  };
}

/** The rows a cave rock rises above the water at u (0 center, 1 edge). Shared with GameScene.landTopAt. */
export function caveRockRows(u: number, aboveRows: number): number {
  return u >= 1 ? 0 : Math.min(7, aboveRows - 2) * Math.pow(1 - u * u, 0.6);
}

/**
 * A cave rock (the Coral Cave's roof, the Trench's roof): a low mossy hump with a few ferns above the water, and below it a thick
 * slab of dark stone with a flat underside, wet streaks and stalactites dripping from the roof.
 */
export function makeCaveRock(scene: Phaser.Scene, key: string, t: Terrain, cx: number, width: number, depth: number, above: number, P: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(width / P) + 4;
  const aboveRows = Math.floor(above / P);
  const rows = aboveRows + Math.ceil(depth / P) + 10;
  const [c, g] = canvas(cols, rows);
  // Written straight into the pixels (one fillRect per pixel is slow for a roof this big).
  const img = g.createImageData(cols, rows);
  const rgbOf = new Map<string, number>();
  const px = (_g: unknown, x: number, y: number, col: string) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= cols || y >= rows) return;
    let v = rgbOf.get(col);
    if (v === undefined) rgbOf.set(col, (v = parseInt(col.slice(1, 7), 16)));
    const k = (y * cols + x) * 4;
    img.data[k] = v >> 16; img.data[k + 1] = (v >> 8) & 255; img.data[k + 2] = v & 255; img.data[k + 3] = 255;
  };
  const r = rng(seed);
  const left = cx - (cols * P) / 2;
  const bottom = undersideOf(t, left, P);
  const half = cols / 2;
  const hump = (x: number) => Math.round(caveRockRows(Math.abs(x - half) / (half * 0.8), aboveRows));
  for (let x = 0; x < cols; x++) {
    const h = hump(x);
    for (let k = 0; k < h; k++) {
      const y = aboveRows - 1 - k;
      const edge = k === h - 1 || hump(x - 1) <= k || hump(x + 1) <= k;
      px(g, x, y, edge ? (r() < 0.5 ? C.leaf : C.leafDark) : bayer(x, y) < 0.5 ? C.grey : C.slate);
    }
    // Ferns on top.
    if (h > 3 && r() < 0.06) for (let k = 1; k <= 3; k++) px(g, x + (k % 2), aboveRows - h - k, k === 3 ? C.leafLight : C.leaf);
  }
  for (let x = 0; x < cols; x++) {
    const b = bottom(x);
    if (b < 0) continue;
    for (let y = 0; y <= b; y++) {
      const edge = y === b || bottom(x - 1) < y || bottom(x + 1) < y;
      const u = y / Math.max(1, b);
      let col = u < 0.15 ? C.grey : u < 0.6 ? (bayer(x, y) < (u - 0.15) / 0.45 ? C.slate : C.grey) : bayer(x, y) < (u - 0.6) / 0.4 ? C.navy : C.slate;
      if ((x * 7 + y * 3) % 23 === 0) col = C.navy;                  // pits
      if (x % 17 === 5 && u > 0.2 && u < 0.9 && (y >> 1) % 3 === 0) col = C.stone; // wet streaks
      px(g, x, aboveRows + y, edge ? C.ink : col);
    }
    // Stalactites: short dripping cones under the flat roof, with a bright drop at the tip.
    if (b > 8 && bottom(x - 2) > 8 && bottom(x + 2) > 8 && r() < 0.12) {
      const len = 2 + Math.floor(r() * 6);
      for (let k = 1; k <= len; k++) {
        px(g, x, aboveRows + b + k, k === len ? C.stone : C.slate);
        if (k < len / 2) { px(g, x - 1, aboveRows + b + k, C.navy); px(g, x + 1, aboveRows + b + k, C.navy); }
      }
      if (r() < 0.4) px(g, x, aboveRows + b + len + 2, C.cyan);
    }
  }
  g.putImageData(img, 0, 0);
  add(scene, key, c);
}

/** An iceberg: a jagged white peak above the water and a big blue-white body below (no roots). */
export function makeIceberg(scene: Phaser.Scene, key: string, t: Terrain, cx: number, width: number, depth: number, above: number, P: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(width / P) + 4;
  const aboveRows = Math.floor(above / P);
  const rows = aboveRows + Math.ceil(depth / P) + 2;
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  const left = cx - (cols * P) / 2;
  const bottom = undersideOf(t, left, P);
  const half = cols / 2;
  // Above water: a jagged peak, highest a little off center.
  // Centered, so the game can tell where you can stand on it (GameScene.landTopAt).
  const peakX = half;
  const jag = Array.from({ length: cols }, () => r());
  const peak = (x: number) => {
    const u = Math.abs(x - peakX) / (half * 0.85);
    return u >= 1 ? 0 : Math.round((aboveRows - 3) * Math.pow(1 - u, 1.1) + jag[x] * 2);
  };
  for (let x = 0; x < cols; x++) {
    const h = peak(x);
    for (let k = 0; k < h; k++) {
      const y = aboveRows - 1 - k;
      const edge = k === h - 1 || peak(x - 1) <= k || peak(x + 1) <= k;
      px(g, x, y, edge ? C.stone : x > peakX + 2 && bayer(x, y) < 0.5 ? C.mist : C.white);
    }
  }
  // Below water: the ice body (follows the terrain's ceiling line), lighter at the top, cyan streaks.
  for (let x = 0; x < cols; x++) {
    const b = bottom(x);
    if (b < 0) continue;
    for (let y = 0; y <= b; y++) {
      const edge = y === b || bottom(x - 1) < y || bottom(x + 1) < y;
      const u = y / Math.max(1, b);
      let col = u < 0.3 ? C.white : u < 0.65 ? (bayer(x, y) < (u - 0.3) / 0.35 ? C.mist : C.white) : bayer(x, y) < (u - 0.65) / 0.35 ? C.stone : C.mist;
      // Short frozen cracks, lit cyan.
      if (y % 9 === 4 && (x + (y >> 3) * 5) % 13 < 3 && u < 0.85) col = C.cyan;
      px(g, x, aboveRows + y, edge ? C.slate : col);
    }
  }
  for (let x = 0; x < cols; x++) if (bottom(x) >= 0 && bayer(x, 0) < 0.5) px(g, x, aboveRows, C.cyan);
  add(scene, key, c);
}

/** How far the cone reaches across the island (share of its half width); the rest is a low basalt shore. */
export const VOLCANO_REACH = 0.6;

/** The height (art rows) of a volcano island's cone at column x (0 at the edge). Shared with GameScene.landTopAt. */
export function volcanoRows(u: number, aboveRows: number): number {
  if (u >= 1) return 0;
  const top = aboveRows - 3;
  // A steep cone with a small crater at the top.
  const cone = top * Math.pow(1 - u, 0.9);
  return u < 0.1 ? cone - 2 * (1 - u / 0.1) : cone;
}

/** A volcanic island: a dark cone with a glowing crater, lava streaks and smoke; basalt with lava cracks below. */
export function makeVolcano(scene: Phaser.Scene, key: string, t: Terrain, cx: number, width: number, depth: number, above: number, P: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(width / P) + 4;
  const aboveRows = Math.floor(above / P);
  const rows = aboveRows + Math.ceil(depth / P) + 2;
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  const left = cx - (cols * P) / 2;
  const bottom = undersideOf(t, left, P);
  const half = cols / 2;
  const reach = half * VOLCANO_REACH;
  const cone = (x: number) => Math.round(volcanoRows(Math.abs(x - half) / reach, aboveRows));
  // Two lava streams running down from the crater.
  const streams = [half - 1 - Math.floor(r() * 2), half + 1 + Math.floor(r() * 2)];
  for (let x = 0; x < cols; x++) {
    const h = cone(x);
    for (let k = 0; k < h; k++) {
      const y = aboveRows - 1 - k;
      const edge = k === h - 1 || cone(x - 1) <= k || cone(x + 1) <= k;
      let col = x < half - 2 && bayer(x, y) < 0.35 ? C.grey : bayer(x, y) < 0.15 ? C.navy : C.slate;
      // lava streams: wander outward as they run down
      for (const [i, sx] of streams.entries()) {
        const drift = (h - k) * (i === 0 ? -0.3 : 0.3);
        if (Math.abs(x - (sx + drift)) < 1.3 && k > h * 0.3) col = k > h * 0.8 ? C.gold : (x + y) % 3 ? C.orange : C.red;
      }
      if (edge) col = Math.abs(x - half) < reach * 0.12 ? C.yellow : C.ink;
      px(g, x, y, col);
    }
  }
  // Smoke above the crater.
  const peak = aboveRows - 1 - cone(Math.floor(half));
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(half + (r() - 0.3) * 6), sy = peak - 1 - Math.floor(r() * 3);
    if (sy >= 0) { px(g, sx, sy, C.stone); if (sy - 1 >= 0) px(g, sx + 1, sy - 1, C.mist); }
  }
  // Below water: basalt, darker with depth, with glowing cracks.
  for (let x = 0; x < cols; x++) {
    const b = bottom(x);
    if (b < 0) continue;
    for (let y = 0; y <= b; y++) {
      const edge = y === b || bottom(x - 1) < y || bottom(x + 1) < y;
      const u = y / Math.max(1, b);
      let col = u < 0.35 ? C.slate : bayer(x, y) < (u - 0.35) / 0.65 ? C.navy : C.slate;
      px(g, x, aboveRows + y, edge ? C.ink : col);
    }
  }
  // A few jagged glowing cracks running down through the rock.
  for (let k = 0; k < Math.max(3, Math.round(cols / 18)); k++) {
    let x = 3 + Math.floor(r() * (cols - 6));
    const b0 = bottom(x);
    if (b0 < 6) continue;
    let y = 2 + Math.floor(r() * (b0 * 0.4));
    const len = 5 + Math.floor(r() * 9);
    for (let i = 0; i < len && y < bottom(x) - 1; i++) {
      px(g, x, aboveRows + y, i % 3 === 0 ? C.gold : i % 2 ? C.orange : C.red);
      y++;
      if (r() < 0.45) x += r() < 0.5 ? -1 : 1;
    }
  }
  add(scene, key, c);
}

/** A mangrove clump: bushy trees above the water, a mud bank and a thick tangle of roots below. */
export function makeMangrove(scene: Phaser.Scene, key: string, t: Terrain, cx: number, width: number, depth: number, roots: number, above: number, P: number, seed: number): void {
  if (scene.textures.exists(key)) return;
  const cols = Math.ceil(width / P) + 4;
  const aboveRows = Math.floor(above / P);
  const rows = aboveRows + Math.ceil((depth + roots) / P) + 2;
  const [c, g] = canvas(cols, rows);
  const r = rng(seed);
  const left = cx - (cols * P) / 2;
  const bottom = undersideOf(t, left, P);
  const half = cols / 2;
  const dot = (x: number, y: number, col: string) => { if (x >= 0 && x < cols && y >= 0 && y < rows) px(g, Math.round(x), Math.round(y), col); };
  // Mud bank under the water.
  for (let x = 0; x < cols; x++) {
    const b = bottom(x);
    if (b < 0) continue;
    for (let y = 0; y <= b; y++) {
      const edge = y === b || bottom(x - 1) < y || bottom(x + 1) < y;
      const u = y / Math.max(1, b);
      px(g, x, aboveRows + y, edge ? C.bark : u < 0.3 ? C.clay : bayer(x, y) < u ? C.bark : C.brown);
    }
  }
  // Many arching prop roots (the hiding place).
  const nRoots = Math.max(8, Math.round(cols / 5));
  for (let i = 0; i < nRoots; i++) {
    const x0 = Math.round(half * 0.3 + r() * half * 1.4);
    const b = bottom(x0);
    if (b < 1) continue;
    const len = Math.round((roots / P) * (0.6 + r() * 0.5));
    const lean = (r() - 0.5) * 1.2;
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + lean * k + Math.sin(k / 4 + i) * 1.5);
      dot(x, aboveRows + b + k, k > len - 2 ? C.clay : C.brown);
      dot(x + 1, aboveRows + b + k, C.bark);
    }
  }
  // Above water: roots arching out of the water, thin trunks and round bushy crowns.
  const trees = Math.max(2, Math.round(width / 180));
  for (let i = 0; i < trees; i++) {
    const bx = Math.round(half * 0.35 + ((i + 0.5) / trees) * half * 1.3);
    const h = Math.min(aboveRows - 6, 8 + Math.floor(r() * 5));
    for (let k = 0; k < h; k++) dot(bx + (k > h / 2 ? 1 : 0), aboveRows - 1 - k, C.brown);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) dot(bx + s * (k + 1), aboveRows - 1 - Math.round(Math.sin((k / 3) * Math.PI) * 2), C.bark);
    const cy = aboveRows - 1 - h, rr = 4 + Math.floor(r() * 3);
    for (let y = -rr; y <= rr; y++)
      for (let x = -rr - 1; x <= rr + 1; x++) {
        if ((x * x) / ((rr + 1) * (rr + 1)) + (y * y) / (rr * rr) > 1) continue;
        dot(bx + x, cy + y, y < -rr / 2 ? C.leafLight : bayer(x, y) < 0.3 ? C.leafDark : C.leaf);
      }
  }
  for (let x = 0; x < cols; x++) if (bottom(x) >= 0 && bayer(x, 0) < 0.5) px(g, x, aboveRows, C.leaf);
  add(scene, key, c);
}
