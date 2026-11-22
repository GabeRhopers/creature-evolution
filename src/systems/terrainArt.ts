// Pixel art for the terrain: the ground (sand dunes, rocky ridges, seamounts), islands
// with palm trees and mangrove roots, and coral garden pieces. Same rules as worldTextures:
// 1 texture pixel per art pixel, Endesga 32 colors, seeded so it is the same every run.
import type Phaser from 'phaser';
import { add, bayer, C, canvas, px, rng } from './worldTextures';
import type { Terrain } from './terrain';

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * The whole ground as one image: `P` world px per art pixel, from just above the highest
 * point down to the bottom of the world. Returns the world y of its top edge.
 */
export function makeGround(scene: Phaser.Scene, key: string, t: Terrain, worldH: number, P: number): number {
  const top = Math.max(0, Math.floor(t.highestGround / P) - 2);
  if (scene.textures.exists(key)) return top * P;
  const cols = Math.ceil(t.width / P);
  const rows = Math.ceil(worldH / P) - top;
  const [c, g] = canvas(cols, rows);
  const img = g.createImageData(cols, rows);
  const r = rng(21);
  const col = (n: number) => t.groundAt(n * P + P / 2) / P - top;
  const tops = Float32Array.from({ length: cols + 2 }, (_, i) => Math.round(col(i - 1)));
  const sandLine = (t.seabedTop + 6) / P - top;
  const pal = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, hex(v)])) as Record<keyof typeof C, [number, number, number]>;
  const put = (x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * cols + x) * 4;
    img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
  };
  for (let x = 0; x < cols; x++) {
    const gy = Math.max(0, tops[x + 1]);
    const kind = t.kindAt(x * P + P / 2);
    const rock = kind !== 'sand';
    for (let y = gy; y < rows; y++) {
      const d = y - gy;
      // Exposed side faces of steep rock: the neighbor column starts lower.
      const side = rock && (y < tops[x] || y < tops[x + 2]);
      if (!rock || y > sandLine) {
        // Sand: light top, dithered into darker sand, clay speckles.
        const sd = rock ? y - sandLine : d;
        let p = sd < 2 ? pal.sand : sd < 8 ? (bayer(x, y) < (8 - sd) / 8 ? pal.sand : pal.sandDark) : pal.sandDark;
        if (sd >= 3 && r() < 0.05) p = pal.clay;
        if (sd >= 9 && r() < 0.008) p = pal.brown;
        put(x, y, p);
        continue;
      }
      if (d === 0 || side) { put(x, y, pal.navy); continue; }
      // Rock: a light top, then grey strata that darken toward the seabed.
      // Flat color bands with short dithered blends, so big seamounts don't look noisy.
      const band = (a: number, b: number) => (d - a) / (b - a);
      let p: [number, number, number];
      if (d <= 2) p = pal.stone;
      else if (d < 36) p = pal.grey;
      else if (d < 48) p = bayer(x, y) < band(36, 48) ? pal.slate : pal.grey;
      else p = pal.slate;
      // Strata: short dark ledges.
      if (d > 6 && (y + (x >> 4) * 7) % 29 === 0 && ((x >> 2) & 3) !== 0) p = d < 42 ? pal.slate : pal.navy;
      if (d > 3 && r() < 0.012) p = d < 42 ? pal.slate : pal.navy;
      // Moss and tiny coral on the top of seamounts.
      if (kind === 'seamount' && d <= 3 && r() < 0.18) p = r() < 0.6 ? pal.leaf : pal.pinkLight;
      put(x, y, p);
    }
  }
  g.putImageData(img, 0, 0);
  add(scene, key, c);
  return top * P;
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
