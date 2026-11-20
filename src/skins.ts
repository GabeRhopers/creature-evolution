// Custom creature looks drawn in Sprite Studio.
//
// The studio lives in the same artifact as the game (studio/index.html), so
// both share device storage and the cloud database. A studio project is turned
// into game frames at load time:
//   studio pose   game animation
//   idle          standing still
//   move          swimming (falls back to idle)
//   attack        bite (first frame)
//   rest          digesting (first frame)
//   damage        hit flash (first frame)
//   celebrate     level-up
// The original crocodile always stays available as the fallback.

export interface StudioPose {
  name: string;
  fps?: number;
  frames: string[];
}
export interface StudioProject {
  name: string;
  w: number;
  h: number;
  palette: string[];
  poses: StudioPose[];
  updatedAt?: string;
}
export interface StudioSummary {
  id: string;
  name: string;
  updatedAt: string;
}
/** Which studio frames feed which game animation (indices into the pose's frames). */
export interface PoseMap {
  swim: Array<[string, number]>;
  idle: Array<[string, number]>;
  bite?: [string, number];
  rest?: [string, number];
  damage?: [string, number];
  celebrate: Array<[string, number]>;
}

const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const LOCAL = 'spritestudio:';
/** Game frame size the crocodile was designed for (48x24 pixels at 3x). */
export const SKIN_FRAME_W = 144;
export const SKIN_FRAME_H = 72;

export function decodeFrame(s: string, n: number): Int16Array {
  const f = new Int16Array(n).fill(-1);
  for (let i = 0; i < Math.min(n, s.length); i++) {
    const c = s[i];
    f[i] = c === '.' ? -1 : ALPH.indexOf(c);
  }
  return f;
}

const isEmpty = (s: string) => !/[^.]/.test(s);

/** Check a project before using it. Returns plain-language problems (empty = fine). */
export function validateProject(p: unknown): string[] {
  const out: string[] = [];
  const d = p as StudioProject | null;
  if (!d || typeof d !== 'object') return ['The drawing could not be read.'];
  if (!(d.w >= 4 && d.w <= 128 && d.h >= 4 && d.h <= 128)) out.push('The canvas size is not supported.');
  if (!Array.isArray(d.palette) || !d.palette.every((c) => /^#[0-9a-fA-F]{6}$/.test(c))) out.push('The colors could not be read.');
  if (!Array.isArray(d.poses)) out.push('The poses could not be read.');
  else {
    const map = poseMap(d);
    if (!map.swim.length && !map.idle.length) out.push('Draw at least one frame in the idle or move pose.');
  }
  return out;
}

/** Map studio poses to game animations, skipping empty frames. Pure. */
export function poseMap(p: StudioProject): PoseMap {
  const frames = (name: string): Array<[string, number]> => {
    const pose = p.poses.find((x) => x.name.toLowerCase() === name);
    if (!pose) return [];
    return pose.frames.map((s, i) => [s, i] as [string, number]).filter(([s]) => !isEmpty(s)).map(([, i]) => [name, i]);
  };
  const idle = frames('idle');
  const move = frames('move');
  return {
    swim: move.length ? move : idle,
    idle: idle.length ? idle : move.slice(0, 1),
    bite: frames('attack')[0],
    rest: frames('rest')[0],
    damage: frames('damage')[0],
    celebrate: frames('celebrate'),
  };
}

/** Frame names inside the skin texture, ready for Fish.applySkin. */
export interface SkinFrames {
  swim: string[];
  idle?: string[];
  bite?: string;
  rest?: string;
  damage?: string;
  celebrate?: string[];
}

interface TextureHost {
  textures: {
    exists(key: string): boolean;
    remove(key: string): unknown;
    addCanvas(key: string, canvas: HTMLCanvasElement): { add(name: string, source: number, x: number, y: number, w: number, h: number): unknown } | null;
  };
}

/**
 * Draw every used frame into one canvas texture (frames side by side, 144x72
 * each, pixel art scaled up crisply and centered) and return the frame names.
 */
export function buildSkinTexture(host: TextureHost, key: string, p: StudioProject): SkinFrames {
  const map = poseMap(p);
  const used = new Map<string, string>(); // "pose:i" -> frame name
  const order: Array<[string, number]> = [];
  const want = (pf?: [string, number]) => {
    if (!pf) return undefined;
    const id = `${pf[0]}:${pf[1]}`;
    if (!used.has(id)) {
      used.set(id, `${key}_${used.size}`);
      order.push(pf);
    }
    return used.get(id)!;
  };
  const result: SkinFrames = {
    swim: map.swim.map((f) => want(f)!),
    idle: map.idle.map((f) => want(f)!),
    bite: want(map.bite),
    rest: want(map.rest),
    damage: want(map.damage),
    celebrate: map.celebrate.map((f) => want(f)!),
  };

  const k = Math.max(1, Math.floor(Math.min(SKIN_FRAME_W / p.w, SKIN_FRAME_H / p.h)));
  const ox = Math.floor((SKIN_FRAME_W - p.w * k) / 2);
  const oy = Math.floor((SKIN_FRAME_H - p.h * k) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_FRAME_W * Math.max(1, order.length);
  canvas.height = SKIN_FRAME_H;
  const g = canvas.getContext('2d')!;
  order.forEach(([pose, i], slot) => {
    const src = p.poses.find((x) => x.name.toLowerCase() === pose)!.frames[i];
    const px = decodeFrame(src, p.w * p.h);
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const c = px[y * p.w + x];
        if (c < 0 || c >= p.palette.length) continue;
        g.fillStyle = p.palette[c];
        g.fillRect(slot * SKIN_FRAME_W + ox + x * k, oy + y * k, k, k);
      }
    }
  });
  if (host.textures.exists(key)) host.textures.remove(key);
  const tex = host.textures.addCanvas(key, canvas)!;
  order.forEach((_, slot) => tex.add(`${key}_${slot}`, 0, slot * SKIN_FRAME_W, 0, SKIN_FRAME_W, SKIN_FRAME_H));
  return result;
}

// ------------------------------------------------------------------ loading

type Db = {
  doc(path: string): { get(): Promise<{ exists: boolean; data(): unknown }> };
  collection(path: string): { get(): Promise<{ docs: Array<{ id: string; data(): unknown }> }> };
};
let dbPromise: Promise<Db | null> | null = null;
/** The artifact's cloud database, or null (signed out, offline, or running outside claude.ai). */
export function cloudDb(timeoutMs = 6000): Promise<Db | null> {
  if (!dbPromise) {
    const use = (window as unknown as { claude?: { use?: (n: string) => Promise<unknown> } }).claude?.use;
    dbPromise = use
      ? Promise.race([use('db') as Promise<Db | null>, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]).catch(() => null)
      : Promise.resolve(null);
  }
  return dbPromise;
}

function readLocal(id: string): StudioProject | null {
  try {
    const v = JSON.parse(window.localStorage.getItem(LOCAL + id) || 'null');
    return v && typeof v === 'object' && 'poses' in v ? v : null;
  } catch {
    return null;
  }
}

/** Load a studio project: the newer of the device copy and the cloud copy. */
export async function loadStudioProject(id: string): Promise<StudioProject | null> {
  const local = readLocal(id);
  let cloud: StudioProject | null = null;
  const db = await cloudDb(local ? 2500 : 6000);
  if (db) {
    try {
      const d = await db.doc('projects/' + id).get();
      if (d.exists) cloud = d.data() as StudioProject;
    } catch {
      /* offline: use the device copy */
    }
  }
  if (local && cloud) return String(local.updatedAt) > String(cloud.updatedAt ?? '') ? local : cloud;
  return local ?? cloud;
}

/** All studio projects on this device and in the cloud, newest first. */
export async function listStudioProjects(): Promise<StudioSummary[]> {
  const out = new Map<string, StudioSummary>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)!;
      if (!key.startsWith(LOCAL) || key === LOCAL + 'last') continue;
      const v = readLocal(key.slice(LOCAL.length));
      if (v) out.set(key.slice(LOCAL.length), { id: key.slice(LOCAL.length), name: v.name, updatedAt: v.updatedAt ?? '' });
    }
  } catch {
    /* storage blocked */
  }
  const db = await cloudDb(3000);
  if (db) {
    try {
      const snap = await db.collection('projects').get();
      for (const d of snap.docs) {
        const v = d.data() as StudioProject;
        out.set(d.id, { id: d.id, name: v.name, updatedAt: v.updatedAt ?? '' });
      }
    } catch {
      /* offline */
    }
  }
  return [...out.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ------------------------------------------------------------------ the active look

/** The project the next run uses (null = the original crocodile). */
let active: { id: string; project: StudioProject } | null = null;
export function setActiveSkin(v: { id: string; project: StudioProject } | null): void {
  active = v;
}
export function getActiveSkin() {
  return active;
}
