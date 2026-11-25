// Boss arena art (generated pixel art, Endesga 32 colors, drawn 1 texture pixel per art pixel and shown at WORLD_PX):
// the small cave entrance on the seabed, and the closed cave the fight happens in (a separate screen below the world).
import Phaser from 'phaser';

type RGB = [number, number, number];
const hex = (c: string): RGB => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const C = {
  outline: hex('#181425'),
  dark: hex('#262b44'),
  rock: hex('#3a4466'),
  rockLight: hex('#5a6988'),
  moss: hex('#3e8948'),
  mossLight: hex('#63c74d'),
  waterTop: hex('#124e89'),
  waterDeep: hex('#193c3e'),
  glow: hex('#2ce8f5'),
  air: hex('#c0cbdc'),
  airLight: hex('#ffffff'),
  sand: hex('#b86f50'),
  sandDark: hex('#733e39'),
  coral: hex('#e43b44'),
  coral2: hex('#f77622'),
  light: hex('#0099db'),
};

/** A tiny repeatable noise (so every run draws the same cave). */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasFor(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  const put = (x: number, y: number, c: RGB, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (Math.floor(y) * w + Math.floor(x)) * 4;
    img.data[i] = c[0];
    img.data[i + 1] = c[1];
    img.data[i + 2] = c[2];
    img.data[i + 3] = a;
  };
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img.data[(y * w + x) * 4 + 3]);
  const done = () => {
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    (tex as unknown as { setSmoothPixelArt?: (v: boolean) => void }).setSmoothPixelArt?.(true);
  };
  return { put, get, done, img };
}

/** The cave entrance: a small mossy rock on the seabed with a dark arched hole (w x h art px, bottom = the ground). */
export function makeCaveEntrance(scene: Phaser.Scene, key: string, w = 56, h = 34): void {
  if (scene.textures.exists(key)) return;
  const { put, get, done } = canvasFor(scene, key, w, h);
  const r = rnd(7);
  const cx = w / 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x - cx) / (w / 2 - 1), v = (h - 1 - y) / (h - 2);
      if (u * u + v * v * 1.05 > 1) continue;                     // a rounded rock
      const shade = v > 0.82 ? (r() < 0.6 ? C.moss : C.mossLight) : u < -0.2 || r() < 0.08 ? C.rock : C.rockLight;
      put(x, y, shade);
    }
  // The hole: an arch, black inside with a faint glow at the back.
  const hw = w * 0.22, hh = h * 0.62;
  for (let y = h - 1; y > h - 1 - hh; y--)
    for (let x = Math.floor(cx - hw); x <= cx + hw; x++) {
      const u = (x - cx) / hw, v = (h - 1 - y) / hh;
      if (u * u + Math.max(0, v - 0.45) ** 2 * 3.5 > 1) continue;
      put(x, y, v < 0.35 && Math.abs(u) < 0.45 ? C.waterTop : C.outline);
    }
  // Outline around the rock.
  const edge: Array<[number, number]> = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!get(x, y) && (get(x + 1, y) || get(x - 1, y) || get(x, y + 1) || get(x, y - 1))) edge.push([x, y]);
  for (const [x, y] of edge) put(x, y, C.outline);
  done();
}

/**
 * The boss arena (w x h art px): rock walls all round, open water inside (`wall` px from the edges, rough), stalactites,
 * a sandy floor with coral, an air pocket in the ceiling at `airAt` (share of the width), and the EXIT tunnel through the
 * left wall (`exitTop`..`exitBottom` art rows), bright with daylight from outside.
 */
export function makeArena(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  wall: number,
  airAt: number,
  exitTop: number,
  exitBottom: number,
): void {
  if (scene.textures.exists(key)) return;
  const { put, done } = canvasFor(scene, key, w, h);
  const r = rnd(42);
  const top = wall, bottom = h - wall, left = wall, right = w - wall;
  const wob = (i: number, k: number) => Math.round(2.2 * Math.sin(i / 5 + k) + 1.4 * Math.sin(i / 2.3 + k * 3));
  const water = (x: number, y: number): boolean => {
    if (y < top + wob(x, 1) || y > bottom + wob(x, 2) || x < left + wob(y, 3) || x > right + wob(y, 4)) {
      // the air pocket: a dome cut up into the ceiling
      const ax = w * airAt, ar = wall * 0.75;
      if (y < top + 2 && y > top - ar && (x - ax) ** 2 + ((y - top) * 1.4) ** 2 < ar * ar) return true;
      // the EXIT tunnel through the left wall
      if (x <= left + 3 && y >= exitTop + wob(x, 5) * 0.5 && y <= exitBottom + wob(x, 6) * 0.5) return true;
      return false;
    }
    return true;
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (water(x, y)) {
        const t = (y - top) / (bottom - top);
        const k = Math.max(0, Math.min(1, t));
        const dither = ((x + y) & 1) * 0.08;
        const c: RGB = k + dither < 0.5 ? C.waterTop : C.waterDeep;
        // air pocket and tunnel light
        if (y < top - 1) put(x, y, y < top - 6 ? C.airLight : C.air);
        else if (x < left) put(x, y, x < left - wall * 0.6 ? C.light : (x + y) & 1 ? C.light : C.waterTop);
        else put(x, y, c);
      } else {
        const speck = r();
        put(x, y, speck < 0.06 ? C.outline : speck < 0.22 ? C.rock : C.dark);
      }
    }
  // Rock edge outline, stalactites, glowing crystals.
  for (let x = left - 4; x < right + 4; x += 1) {
    if (r() < 0.12) {
      const len = 4 + Math.floor(r() * 10);
      for (let d = 0; d < len; d++) {
        const half = Math.max(0, Math.floor((len - d) / 4));
        for (let s = -half; s <= half; s++) put(x + s, top + wob(x, 1) + d, d === len - 1 ? C.outline : C.rock);
      }
    }
  }
  for (let i = 0; i < 40; i++) {
    const side = r();
    const x = side < 0.5 ? Math.floor(r() * w) : r() < 0.5 ? Math.floor(r() * (left - 4)) : right + 4 + Math.floor(r() * (w - right - 6));
    const y = side < 0.5 ? (r() < 0.5 ? Math.floor(r() * (top - 4)) : bottom + 4 + Math.floor(r() * (h - bottom - 6))) : Math.floor(r() * h);
    put(x, y, C.glow);
    put(x + 1, y, C.glow);
    put(x, y - 1, C.air);
  }
  // Sandy floor with pebbles, coral clumps and weed.
  for (let x = left - 6; x < right + 6; x++) {
    const g = bottom + wob(x, 2);
    for (let d = 0; d < 6; d++) put(x, g - d, d < 2 ? C.sandDark : r() < 0.1 ? C.sandDark : C.sand);
    if (r() < 0.05) {
      const ht = 4 + Math.floor(r() * 8), col = r() < 0.5 ? C.coral : C.coral2;
      for (let d = 0; d < ht; d++) put(x + Math.round(Math.sin(d / 2) * 1.2), g - 6 - d, col);
    } else if (r() < 0.05) {
      const ht = 6 + Math.floor(r() * 12);
      for (let d = 0; d < ht; d++) put(x + Math.round(Math.sin(d / 3 + x) * 1.5), g - 6 - d, d % 3 ? C.moss : C.mossLight);
    }
  }
  done();
}
