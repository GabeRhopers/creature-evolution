// Skin maker: turns a picture of a creature (a sprite sheet with one or more poses, or a single drawing) into
// Sprite Studio designs for one hero, all three stages, plus color versions. It does in the browser what
// tools/elder/convert_elder.py and tools/heroes/egg_hatchling.py do by hand:
//   1. find the background (transparent, or the most common border color) and each sprite on it
//      (connected shapes; labels and stray bits are skipped),
//   2. shrink every sprite to art pixels with one shared scale, so all poses keep the same size,
//   3. map the colors to the game's palette (Endesga 32) plus up to three signature colors,
//   4. guess which way each sprite faces (by comparing its outline with the hero's own design) and its pose,
//   5. assemble the poses on the hero's canvas (the snout stays put while swimming and biting),
//      filling missing poses (tail sway, an opened jaw), and build the hatchling inside its egg.
// Everything here is pure (no DOM), so it runs in tests too. Images are { w, h, data: RGBA bytes }.

export const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const ENDESGA32 = ['#181425', '#262b44', '#3a4466', '#5a6988', '#8b9bb4', '#c0cbdc', '#ffffff', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731',
  '#be4a2f', '#d77643', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e', '#124e89', '#0099db', '#2ce8f5',
  '#ff0044', '#a22633', '#e43b44', '#f6757a', '#e8b796', '#c28569', '#68386c', '#b55088'];
export const OUTLINE = '#181425';
export const POSES = ['move', 'attack', 'damage', 'celebrate', 'skip'];
export const POSE_LABELS = { move: 'Swim', attack: 'Bite', damage: 'Hurt', celebrate: 'Roar', skip: 'Skip' };
const MARGIN = 3;
const MAX_FRAMES = 5;

// ------------------------------------------------------------------ small helpers
export const hexToRgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** Color distance that follows the eye a little (green counts most). Squared. */
const dist2 = (a, b) => 2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2;

export function encodeGrid(g) { let s = ''; for (const row of g) for (const v of row) s += v < 0 ? '.' : ALPH[v]; return s; }
export function decodeGrid(s, w, h) {
  const g = [];
  for (let y = 0; y < h; y++) { const row = new Array(w); for (let x = 0; x < w; x++) { const c = s[y * w + x]; row[x] = c === '.' || c === undefined ? -1 : ALPH.indexOf(c); } g.push(row); }
  return g;
}
const emptyGrid = (w, h) => Array.from({ length: h }, () => new Array(w).fill(-1));
const copyGrid = (g) => g.map((r) => r.slice());
export const flipGrid = (g) => g.map((r) => r.slice().reverse());
export function bbox(g) {
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  g.forEach((row, y) => row.forEach((v, x) => { if (v >= 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }));
  return x1 < 0 ? null : { x0, x1, y0, y1 };
}
function trim(g) {
  const b = bbox(g); if (!b) return [[]];
  return g.slice(b.y0, b.y1 + 1).map((r) => r.slice(b.x0, b.x1 + 1));
}

// ------------------------------------------------------------------ 1. background and sprites
/** The background: 'transparent', or the most common color along the picture's border. */
export function findBackground(img) {
  const { w, h, data } = img;
  let clear = 0, total = 0;
  for (let i = 3; i < data.length; i += 4 * 7) { total++; if (data[i] < 40) clear++; }
  if (clear / total > 0.08) return { transparent: true, rgb: null };
  const bins = new Map();
  const add = (x, y) => {
    const k = (y * w + x) * 4; const r = data[k], g = data[k + 1], b = data[k + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; bins.set(key, e);
  };
  const step = Math.max(1, Math.floor((w + h) / 800));
  for (let x = 0; x < w; x += step) { add(x, 0); add(x, h - 1); }
  for (let y = 0; y < h; y += step) { add(0, y); add(w - 1, y); }
  let best = null; for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  const rgb = [best.r / best.n, best.g / best.n, best.b / best.n];
  // How noisy the background is (JPEG speckles): the typical difference of border pixels near its color.
  const diffs = [];
  const look = (x, y) => { const k = (y * w + x) * 4; const d = Math.abs(data[k] - rgb[0]) + Math.abs(data[k + 1] - rgb[1]) + Math.abs(data[k + 2] - rgb[2]); if (d < 90) diffs.push(d); };
  for (let x = 0; x < w; x += step) { look(x, 0); look(x, h - 1); }
  for (let y = 0; y < h; y += step) { look(0, y); look(w - 1, y); }
  diffs.sort((a, b) => a - b);
  const noise = diffs.length ? diffs[Math.floor(diffs.length * 0.9)] : 0;
  return { transparent: false, rgb, noise };
}

/**
 * The sprites on the picture: connected shapes that are not background, biggest first trimmed of labels and
 * crumbs (smaller than `minShare` of the biggest shape), in reading order (rows top to bottom, then left to right).
 * Returns { bg, labels (Int32Array, one per picture pixel), sprites: [{ id, x, y, w, h, area, row }] }.
 */
export function findSprites(img, opts = {}) {
  const { w, h, data } = img;
  const bg = findBackground(img);
  // Tight for clean pictures, looser for noisy ones (a grey body must not count as a navy background).
  const thr = opts.threshold ?? Math.max(18, Math.min(70, 2.5 * (bg.noise || 0) + 14));
  // Background = background-colored pixels reachable from the picture's edge. Dark parts of a sprite that look like
  // the background (a navy shark on a navy sheet) stay in the sprite when its outline closes them in.
  const bgLike = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < w * h; i++, k += 4) {
    if (data[k + 3] < 100) { bgLike[i] = 1; continue; }
    if (bg.transparent) continue;
    const d = Math.abs(data[k] - bg.rgb[0]) + Math.abs(data[k + 1] - bg.rgb[1]) + Math.abs(data[k + 2] - bg.rgb[2]);
    if (d <= thr) bgLike[i] = 1;
  }
  const stack = new Int32Array(w * h);
  const outside = new Uint8Array(w * h);
  {
    let sp = 0;
    const seed = (i) => { if (bgLike[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (sp) {
      const i = stack[--sp]; const x = i % w;
      if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < w * (h - 1)) seed(i + w);
    }
  }
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (!outside[i] && data[i * 4 + 3] >= 100) mask[i] = 1;
  // 8-connected labels (an explicit stack: no recursion, fine for big pictures).
  const labels = new Int32Array(w * h);
  const found = [];
  let next = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    next++;
    let sp = 0, area = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack[sp++] = start; labels[start] = next;
    while (sp) {
      const i = stack[--sp]; area++;
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && !labels[j]) { labels[j] = next; stack[sp++] = j; }
        }
      }
    }
    found.push({ id: next, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  const biggest = found.reduce((m, s) => Math.max(m, s.area), 0);
  const minShare = opts.minShare ?? 0.2;
  let sprites = found.filter((s) => s.area >= Math.max(30, biggest * minShare) && s.h >= 4 && s.w >= 4);
  // Reading order: rows by vertical center.
  sprites.sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2));
  const medH = sprites.length ? sprites.map((s) => s.h).sort((a, b) => a - b)[sprites.length >> 1] : 0;
  let row = -1, rowCy = -Infinity;
  for (const s of sprites) { const cy = s.y + s.h / 2; if (cy - rowCy > medH * 0.5) { row++; rowCy = cy; } s.row = row; }
  sprites.sort((a, b) => a.row - b.row || a.x - b.x);
  sprites = sprites.slice(0, opts.max ?? 24);
  // Text labels (IDLE, WALK...): short, wide little shapes. Each one starts a new group of poses.
  // Without labels, each row is a group.
  const texts = found.filter((s) => s.area < biggest * minShare && s.h < medH * 0.25 && s.w > s.h * 1.6 && s.area > 20);
  if (texts.length) {
    let g = 0; const ord = (s) => s.y + s.h / 2;
    const marks = texts.map(ord).sort((a, b) => a - b);
    for (const s of sprites) s.group = marks.filter((m) => m < s.y + s.h * 0.1).length;
    const ids = [...new Set(sprites.map((s) => s.group))]; for (const s of sprites) s.group = ids.indexOf(s.group); void g;
  } else for (const s of sprites) s.group = s.row;
  return { bg, labels, sprites };
}

// ------------------------------------------------------------------ 2. pixel size
/** The one scale (art pixels per picture pixel) that fits the biggest sprite on the canvas, times `size` (0..1]. */
export function fitScale(sprites, canvasW, canvasH, size = 1) {
  const maxW = Math.max(...sprites.map((s) => s.w)), maxH = Math.max(...sprites.map((s) => s.h));
  return Math.min((canvasW - 2 * MARGIN - 2) / maxW, (canvasH - 2 * MARGIN - 2) / maxH) * size;
}

/** Shrink one sprite to art pixels: each takes the median color of its own picture pixels under it. Grid of [r,g,b] or null. */
export function sampleSprite(img, labels, s, scale) {
  const { w, data } = img;
  const ow = Math.max(1, Math.round(s.w * scale)), oh = Math.max(1, Math.round(s.h * scale));
  const out = [];
  const rs = [], gs = [], bs = [];
  const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  for (let oy = 0; oy < oh; oy++) {
    const row = [];
    const ya = s.y + Math.floor(oy / scale), yb = Math.max(ya + 1, s.y + Math.floor((oy + 1) / scale));
    for (let ox = 0; ox < ow; ox++) {
      const xa = s.x + Math.floor(ox / scale), xb = Math.max(xa + 1, s.x + Math.floor((ox + 1) / scale));
      rs.length = gs.length = bs.length = 0; let n = 0;
      for (let y = ya; y < Math.min(yb, s.y + s.h); y++) for (let x = xa; x < Math.min(xb, s.x + s.w); x++) {
        n++; const i = y * w + x; if (labels[i] !== s.id) continue;
        const k = i * 4; rs.push(data[k]); gs.push(data[k + 1]); bs.push(data[k + 2]);
      }
      row.push(n && rs.length / n > 0.4 ? [med(rs), med(gs), med(bs)] : null);
    }
    out.push(row);
  }
  return out;
}

// ------------------------------------------------------------------ 3. colors
/**
 * The skin's palette: the game's colors, plus up to `maxSignature` colors the game palette has nothing close to
 * (like the Elder Croc's lime body), when enough of the drawing uses them.
 */
export function buildPalette(rgbGrids, maxSignature = 3) {
  const base = ENDESGA32.map(hexToRgb);
  const far = []; let total = 0;
  for (const g of rgbGrids) for (const row of g) for (const c of row) {
    if (!c) continue; total++;
    let best = Infinity; for (const b of base) best = Math.min(best, dist2(c, b));
    if (best > 3 * 55 * 55) far.push(c);
  }
  const sig = [];
  if (far.length > total * 0.04) {
    // A few rounds of k-means on the far colors, started from colors spread far apart.
    const k = Math.min(maxSignature, Math.max(1, Math.round(far.length / (total * 0.06))));
    const centers = [far[0]];
    while (centers.length < k) {
      let pick = null, pd = -1;
      for (let i = 0; i < far.length; i += Math.max(1, far.length >> 9)) { const d = Math.min(...centers.map((c) => dist2(c, far[i]))); if (d > pd) { pd = d; pick = far[i]; } }
      if (!pick || pd < 3 * 30 * 30) break; centers.push(pick);
    }
    for (let it = 0; it < 6; it++) {
      const acc = centers.map(() => [0, 0, 0, 0]);
      for (const c of far) { let bi = 0, bd = Infinity; centers.forEach((m, i) => { const d = dist2(c, m); if (d < bd) { bd = d; bi = i; } }); const a = acc[bi]; a[0] += c[0]; a[1] += c[1]; a[2] += c[2]; a[3]++; }
      acc.forEach((a, i) => { if (a[3]) centers[i] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]]; });
    }
    for (const c of centers) {
      const n = far.filter((f) => centers.every((m) => dist2(f, c) <= dist2(f, m))).length;
      if (n > total * 0.03) sig.push(rgbToHex(...c));
    }
  }
  return ENDESGA32.concat(sig);
}

/** Map an [r,g,b] grid to palette indices. */
export function mapColors(rgbGrid, palette) {
  const pal = palette.map(hexToRgb);
  const cache = new Map();
  return rgbGrid.map((row) => row.map((c) => {
    if (!c) return -1;
    const key = (c[0] << 16) | (c[1] << 8) | c[2];
    if (cache.has(key)) return cache.get(key);
    let bi = 0, bd = Infinity; pal.forEach((p, i) => { const d = dist2(c, p); if (d < bd) { bd = d; bi = i; } });
    cache.set(key, bi); return bi;
  }));
}

/** Keep only the colors the frames use (plus the outline), renumbering every frame. */
export function compactPalette(palette, grids) {
  const used = new Set([palette.indexOf(OUTLINE)]);
  for (const g of grids) for (const row of g) for (const v of row) if (v >= 0) used.add(v);
  const keep = [...used].filter((i) => i >= 0).sort((a, b) => a - b);
  const map = new Map(keep.map((v, i) => [v, i]));
  return { palette: keep.map((i) => palette[i]), grids: grids.map((g) => g.map((row) => row.map((v) => (v < 0 ? -1 : map.get(v))))) };
}

// ------------------------------------------------------------------ 4. facing and poses
/** How much body each tenth of the length has (columns filled), normalized. */
function profile(g, bins = 12) {
  const b = bbox(g); if (!b) return new Array(bins).fill(0);
  const L = b.x1 - b.x0 + 1; const out = new Array(bins).fill(0);
  for (let x = b.x0; x <= b.x1; x++) { let n = 0; for (const row of g) if (row[x] >= 0) n++; out[Math.min(bins - 1, Math.floor(((x - b.x0) / L) * bins))] += n; }
  const m = Math.max(...out) || 1; return out.map((v) => v / m);
}
const corr = (a, b) => { const ma = a.reduce((s, v) => s + v, 0) / a.length, mb = b.reduce((s, v) => s + v, 0) / b.length;
  let n = 0, da = 0, db = 0; a.forEach((v, i) => { n += (v - ma) * (b[i] - mb); da += (v - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db || 1); };
/**
 * Does this sprite face right? Compared with a reference drawing that faces right (the hero's own design):
 * the side whose body outline matches is the head. Without a reference, the heavier end is taken as the head.
 */
export function facesRight(g, reference) {
  const p = profile(g);
  if (reference) { const r = profile(reference); return corr(p, r) >= corr(p.slice().reverse(), r); }
  const n = p.length, k = Math.max(1, Math.round(n * 0.3));
  const left = p.slice(0, k).reduce((s, v) => s + v, 0), right = p.slice(n - k).reduce((s, v) => s + v, 0);
  return right >= left;
}

/**
 * A first guess at each sprite's pose, group by group (a label like WALK starts a group; otherwise a row is one): a group of
 * the other rows are swim, bite and hurt in order. More than five sprites in a pose are skipped.
 */
export function guessPoses(sprites) {
  const key = (s) => (s.group ?? s.row);
  const groups = [...new Set(sprites.map(key))];
  const aspect = (r) => { const a = sprites.filter((s) => key(s) === r).map((s) => s.h / s.w).sort((x, y) => x - y); return a[a.length >> 1]; };
  const flat = Math.min(...groups.map(aspect));
  const tall = groups.length > 1 ? groups.find((r) => aspect(r) > flat * 1.45) : undefined;
  const rest = groups.length - (tall === undefined ? 0 : 1);
  // Four or more groups: the first two are usually a still pose and a swim (both become swim frames).
  const order = rest >= 4 ? ['move', 'move', 'attack', 'damage'] : ['move', 'attack', 'damage'];
  const groupPose = {}; let k = 0;
  for (const r of groups) groupPose[r] = r === tall ? 'celebrate' : order[k++] || 'skip';
  const count = {};
  return sprites.map((s) => { const p = groupPose[key(s)]; count[p] = (count[p] || 0) + 1; return p !== 'skip' && count[p] > MAX_FRAMES ? 'skip' : p; });
}

// ------------------------------------------------------------------ 5. assembling the design
function place(g, W, H, right) {
  const t = trim(g); const h = t.length, w = t[0].length;
  const c = emptyGrid(W, H);
  const x0 = right === undefined ? Math.floor((W - w) / 2) : right - w;
  const y0 = Math.floor((H - h) / 2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x0 + x, Y = y0 + y;
    if (t[y][x] >= 0 && X >= MARGIN - 1 && Y >= MARGIN - 1 && X < W - MARGIN + 1 && Y < H - MARGIN + 1) c[Y][X] = t[y][x];
  }
  return c;
}

/** Extra swim frames from one: the back of the body sways up and down. */
export function swaySwim(g) {
  const b = bbox(g); if (!b) return [g];
  const L = b.x1 - b.x0 + 1;
  const shift = (dir) => {
    const H = g.length, W = g[0].length; const out = emptyGrid(W, H);
    for (let x = 0; x < W; x++) {
      const t = (x - b.x0) / L;   // 0 = tail tip, 1 = snout
      const dy = t < 0.2 ? 2 * dir : t < 0.42 ? dir : 0;
      for (let y = 0; y < H; y++) { const v = g[y][x]; if (v < 0) continue; const Y = y + dy; if (Y >= 0 && Y < H) out[Y][x] = v; }
    }
    return out;
  };
  return [g, shift(-1), g, shift(1)];
}

/** A bite from a closed mouth: the front of the lower jaw drops, showing the inside of the mouth. */
export function openJaw(g, mouthY, palette) {
  const b = bbox(g); if (!b) return g;
  const H = g.length, W = g[0].length; const L = b.x1 - b.x0 + 1;
  const inside = ['#a22633', '#e43b44', '#3e2731', OUTLINE].map((c) => palette.indexOf(c)).find((i) => i >= 0) ?? 0;
  const out = copyGrid(g);
  const front = Math.round(b.x1 - L * 0.24);
  for (let x = front; x <= b.x1; x++) {
    for (let y = H - 1; y > mouthY; y--) { out[y][x] = -1; const src = g[y - 2] && y - 2 > mouthY ? g[y - 2][x] : -1; if (y < H - 1) out[y][x] = src; }
    const open = Math.round(2 * (x - front) / Math.max(1, b.x1 - front));
    for (let k = 1; k <= open; k++) if (g[mouthY + k] && g[mouthY][x] >= 0) out[mouthY + k][x] = inside;
  }
  return out;
}

/**
 * The skin's juvenile (and adult) design. `frames` = [{ grid, pose }] already facing right.
 * `hero` = the hero's own juvenile design (canvas, scale and hitbox stay the same, so the game plays the same).
 */
export function assemble(frames, palette, hero) {
  const W = hero.w, H = hero.h;
  const by = (p) => frames.filter((f) => f.pose === p).map((f) => f.grid).slice(0, MAX_FRAMES);
  let swim = by('move'), bites = by('attack'), hurts = by('damage'), roars = by('celebrate');
  if (!swim.length) swim = [(bites[0] || hurts[0] || roars[0] || frames[0].grid)];
  const swim0 = place(swim[0], W, H);
  const sb = bbox(swim0); const snout = sb.x1 + 1;
  const swimF = swim.map((g) => place(g, W, H, snout));
  // The mouth: just behind the snout, at the middle of the head's front columns.
  const ys = []; for (let x = snout - 4; x < snout; x++) for (let y = 0; y < H; y++) if (swimF[0][y] && swimF[0][y][x] >= 0) ys.push(y);
  const mouthY = ys.length ? Math.round(ys.reduce((s, v) => s + v, 0) / ys.length) : Math.round(H / 2);
  const mouth = [Math.max(Math.round(W / 2) + 2, snout - 3), mouthY];
  const swimFrames = swimF.length === 1 ? swaySwim(swimF[0]) : swimF;
  const biteFrames = bites.length ? bites.map((g) => place(g, W, H, snout)) : [swimF[0], openJaw(swimF[0], mouthY, palette)];
  const hurtFrames = hurts.length ? hurts.slice(0, 1).map((g) => place(g, W, H)) : [swimF[0]];
  const roarFrames = roars.length ? roars.map((g) => place(g, W, H)) : swimFrames.slice(0, 2);
  const all = [...swimFrames, ...biteFrames, ...hurtFrames, ...roarFrames];
  const c = compactPalette(palette, all);
  let i = 0; const take = (n) => c.grids.slice(i, (i += n)).map(encodeGrid);
  const move = take(swimFrames.length), attack = take(biteFrames.length), damage = take(hurtFrames.length), celebrate = take(roarFrames.length);
  return {
    w: W, h: H, palette: c.palette, framework: hero.framework, bodyRadius: hero.bodyRadius, pixelScale: hero.pixelScale || 2,
    mouth, mouthRadius: hero.mouthRadius,
    poses: [
      { name: 'idle', fps: 3, frames: [move[0]] },
      { name: 'move', fps: 6, frames: move },
      { name: 'attack', fps: 10, frames: attack },
      { name: 'damage', fps: 6, frames: damage },
      { name: 'celebrate', fps: 5, frames: celebrate },
      { name: 'rest', fps: 2, frames: [move[0]] },
    ],
  };
}

// ------------------------------------------------------------------ the hatchling, inside its egg (egg_hatchling.py)
const SHELLS = { white: ['#ffffff', '#c0cbdc'], beige: ['#ead4aa', '#c28569'] };

function eggShape(project, hide) {
  const { w, h } = project;
  const pose = project.poses.find((p) => p.name === 'move' && p.frames.length) || project.poses.find((p) => p.frames.length);
  const g = decodeGrid(pose.frames[0], w, h);
  const b = bbox(g); const L = b.x1 - b.x0 + 1;
  let rx = (L * hide) / 2; const cx = b.x0 + L * 0.47;
  const col = [];
  for (let y = 0; y < h; y++) for (let x = Math.floor(cx - rx * 0.5); x <= Math.floor(cx + rx * 0.5); x++) if (x >= 0 && x < w && g[y][x] >= 0) col.push(y);
  const thick = col.length ? Math.max(...col) - Math.min(...col) + 1 : L * 0.2;
  let ry = Math.min(Math.max(rx * 0.66, thick * 0.55), rx * 0.78);
  const cy = col.length ? (Math.min(...col) + Math.max(...col)) / 2 : h / 2;
  ry = Math.min(ry, cy - MARGIN, h - 1 - MARGIN - cy);
  rx = Math.min(rx, cx - MARGIN, w - 1 - MARGIN - cx);
  return { cx, cy, rx, ry };
}

function eggFrame(g, pal, shape, shell, shade, outI, k) {
  const h = g.length, w = g[0].length; const { cx, cy, rx, ry } = shape;
  const eggR = (x, y) => { const sx = rx * (x < cx ? 1.08 : 0.94); return ((x - cx) / sx) ** 2 + ((y - cy) / ry) ** 2; };
  const inside = []; const ins = new Set();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (eggR(x + 0.5, y + 0.5) <= 1) { inside.push([x, y]); ins.add(y * w + x); }
  const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && ins.has(y * w + x);
  // The claws take the creature's main color: the most common non-outline color under the egg.
  const count = new Map();
  for (const [x, y] of inside) { const v = g[y][x]; if (v >= 0 && pal[v] !== OUTLINE && pal[v] !== '#000000') count.set(v, (count.get(v) || 0) + 1); }
  let claw = 0, cn = -1; for (const [v, n] of count) if (n > cn) { cn = n; claw = v; }
  const out = copyGrid(g);
  for (const [x, y] of inside) out[y][x] = (y - cy) / ry + (cx - x) / (rx * 2.2) > 0.55 ? shade : shell;
  for (const [x, y] of inside) if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !has(x + dx, y + dy))) out[y][x] = outI;
  const ok = (x, y) => x >= 3 && y >= 3 && x < w - 3 && y < h - 3;
  // Jagged holes where the head and the tail come out.
  for (const side of [1, -1]) for (let y = 0; y < h; y++) {
    const row = []; for (let x = 0; x < w; x++) if (has(x, y)) row.push(x);
    if (!row.length || Math.abs(y - cy) > ry * 0.7) continue;
    const edge = side > 0 ? Math.max(...row) : Math.min(...row);
    if (!(edge + side >= 0 && edge + side < w && g[y][edge + side] >= 0)) continue;
    const tooth = Math.floor(y / 2) % 2 === 0 ? 2 : 0;
    for (let t = 1; t <= tooth; t++) { const x = edge + side * t; if (ok(x, y)) out[y][x] = shell; }
    const x = edge + side * (tooth + 1); if (tooth && ok(x, y)) out[y][x] = outI;
  }
  // Zigzag cracks.
  for (const [fx, fy, ln] of [[0.25, -0.45, 4], [-0.35, 0.15, 3], [0.05, 0.35, 3]]) {
    const x0 = cx + fx * rx, y0 = cy + fy * ry;
    for (let s = 0; s < ln; s++) { const px = Math.round(x0 + s), py = Math.round(y0 + (s % 2) - 0.5); if (has(px, py)) out[py][px] = outI; }
  }
  // Two little claws paddling out of the bottom.
  [0.45, -0.35].forEach((fx, i) => {
    const bx = Math.round(cx + fx * rx), by = Math.round(cy + ry * Math.sqrt(Math.max(0, 1 - fx * fx))) - 1;
    const reach = 1 + ((k + i) % 2);
    const pts = [[bx, by], [bx - 1, by], [bx, by + 1], [bx - 1, by + 1], ...[-2, 0, 1].map((t) => [bx + t, by + 1 + reach]), [bx - 1, by + reach], [bx, by + reach]];
    for (const [px, py] of pts) if (ok(px, py)) out[py][px] = claw;
    for (const [px, py] of pts) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + dx, qy = py + dy; if (ok(qx, qy) && out[qy][qx] < 0) out[qy][qx] = outI; }
  });
  return out;
}

/** The hatchling: the juvenile design inside its egg (head and tail poking out, two claws, cracks). */
export function eggHatchling(juvenile, shellKind = 'white', hide = 0.4) {
  const pal = juvenile.palette.slice();
  const color = (c) => { if (!pal.includes(c)) pal.push(c); return pal.indexOf(c); };
  const [shellC, shadeC] = SHELLS[shellKind] || SHELLS.white;
  const shell = color(shellC), shade = color(shadeC), outI = color(OUTLINE);
  const shape = eggShape(juvenile, hide);
  const { w, h } = juvenile;
  const poses = juvenile.poses.map((p) => ({ name: p.name, fps: p.fps, frames: p.frames.map((f, k) => (/[^.]/.test(f) ? encodeGrid(eggFrame(decodeGrid(f, w, h), pal, shape, shell, shade, outI, k)) : f)) }));
  return { ...juvenile, palette: pal, poses, bodyRadius: Math.max(3, Math.round(shape.ry)) };
}

// ------------------------------------------------------------------ color versions
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn; const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh * 60, s, l];
}
function fromHsl([h, s, l]) {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
export const VARIANTS = { dark: 'Dark', albino: 'Albino', golden: 'Golden' };
/** A color version of a design: same pixels, new colors. The outline (and black) stays. */
export function recolor(project, variant) {
  const palette = project.palette.map((hex) => {
    if (hex.toLowerCase() === OUTLINE || hex === '#000000') return hex;
    const [h, s, l] = toHsl(hexToRgb(hex));
    if (variant === 'dark') return fromHsl([h, s * 0.85, l * 0.6]);
    if (variant === 'albino') return fromHsl([350, Math.min(0.35, s * 0.25), 0.62 + 0.38 * l]);
    if (variant === 'golden') return fromHsl([40 + (l - 0.5) * 18, Math.max(0.6, s), Math.min(0.85, l * 1.05)]);
    return hex;
  });
  return { ...project, palette };
}

// ------------------------------------------------------------------ the whole job
/**
 * Picture -> skin. `choices` = [{ pose, flip }] per sprite (from guessPoses/facesRight, adjusted by the player).
 * Returns { juvenile, adult, hatchling } designs (without names or ids).
 */
export function makeSkin(img, found, choices, hero, opts = {}) {
  const scale = fitScale(found.sprites, hero.w, hero.h, opts.size ?? 1);
  const rgb = found.sprites.map((s) => sampleSprite(img, found.labels, s, scale));
  const palette = buildPalette(rgb.filter((_, i) => choices[i].pose !== 'skip'));
  const frames = [];
  rgb.forEach((g, i) => {
    const c = choices[i]; if (c.pose === 'skip') return;
    const grid = mapColors(g, palette);
    frames.push({ grid: c.flip ? flipGrid(grid) : grid, pose: c.pose });
  });
  if (!frames.length) return null;
  const juvenile = assemble(frames, palette, hero);
  return { juvenile, adult: JSON.parse(JSON.stringify(juvenile)), hatchling: eggHatchling(juvenile, opts.shell, opts.hide) };
}
