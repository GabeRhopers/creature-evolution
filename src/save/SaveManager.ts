// Save system, format version 1.
//
// Two kinds of save live on the device:
//   profile    settings, best record, lifetime stats (always kept)
//   checkpoint the run in progress (cleared when the run ends)
//
// Each kind uses two slots: the current save and the last good one. A write
// first copies the current (valid) save into the backup slot, then writes the
// new one, so a crash in the middle of a write can never corrupt both. Every
// save carries a format version, a save time, the app version, a device id and
// a checksum. On load, values are checked and clamped; a broken save falls back
// to the backup, then to defaults, and the caller is told what happened.
//
// Pure logic (no Phaser, no DOM besides the injectable storage) so it can be
// unit-tested.

export const SAVE_VERSION = 1;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type DeathCause = 'swallowed' | 'bitten' | 'starved';

export interface Settings {
  music: boolean;
  sfx: boolean;
  difficulty: Difficulty;
}
export interface Best {
  level: number;
  kills: number;
  fish: number;
}
export interface Profile {
  settings: Settings;
  best: Best;
  lifetime: { runs: number; deaths: Record<DeathCause, number> };
}
export interface RunStats {
  plankton: number;
  fish: number;
  kills: number;
  maxLevel: number;
}
export interface Checkpoint {
  species: string;
  difficulty: Difficulty;
  level: number;
  xp: number;
  /** Health as a share of max health (0..1], so balance changes stay safe. */
  hpRatio: number;
  stamina: number;
  /** Stomach fill as a share of capacity (0..1). */
  stomachRatio: number;
  stomachBank: number;
  x: number;
  y: number;
  runTime: number;
  stats: RunStats;
}

/** What is actually written: the payload plus a header. */
interface Envelope<T> {
  v: number;
  kind: 'profile' | 'checkpoint';
  savedAt: number;
  app: string;
  device: string;
  sum: string;
  data: T;
}

export interface Loaded<T> {
  data: T;
  savedAt: number;
  device: string;
  /** Where the value came from. 'default' means nothing usable was found. */
  source: 'main' | 'backup' | 'default';
  /** Set when a save was found but could not be used. Plain language. */
  problem?: string;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Limits used to clamp loaded values. */
export interface SaveLimits {
  species: string[];
  maxLevel: number;
  worldWidth: number;
  worldHeight: number;
  maxStamina: number;
}

export const DEFAULT_PROFILE: Profile = {
  settings: { music: true, sfx: true, difficulty: 'normal' },
  best: { level: 0, kills: 0, fish: 0 },
  lifetime: { runs: 0, deaths: { swallowed: 0, bitten: 0, starved: 0 } },
};

const KEYS = {
  profile: 'ce.save.profile',
  checkpoint: 'ce.save.checkpoint',
  device: 'ce.device',
  legacyOptions: 'ce.options',
  legacyBest: 'ce.best',
} as const;

// ------------------------------------------------------------------ helpers

/** Small, fast string hash (FNV-1a, 32 bit) to detect damaged saves. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const num = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
};
const int = (v: unknown, lo: number, hi: number, fallback: number) => Math.round(num(v, lo, hi, fallback));
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
const diff = (v: unknown): Difficulty => (v === 'easy' || v === 'hard' ? v : 'normal');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Check and clamp a profile. Never throws: unknown junk becomes defaults. */
export function sanitizeProfile(raw: unknown): Profile {
  const r = obj(raw);
  const s = obj(r.settings);
  const b = obj(r.best);
  const l = obj(r.lifetime);
  const d = obj(l.deaths);
  return {
    settings: { music: bool(s.music, true), sfx: bool(s.sfx, true), difficulty: diff(s.difficulty) },
    best: { level: int(b.level, 0, 999, 0), kills: int(b.kills, 0, 1e7, 0), fish: int(b.fish, 0, 1e7, 0) },
    lifetime: {
      runs: int(l.runs, 0, 1e7, 0),
      deaths: { swallowed: int(d.swallowed, 0, 1e7, 0), bitten: int(d.bitten, 0, 1e7, 0), starved: int(d.starved, 0, 1e7, 0) },
    },
  };
}

/** Check and clamp a checkpoint. Returns null when it cannot be trusted at all. */
export function sanitizeCheckpoint(raw: unknown, lim: SaveLimits): Checkpoint | null {
  const r = obj(raw);
  if (typeof r.species !== 'string' || !lim.species.includes(r.species)) return null;
  if (typeof r.level !== 'number' || !Number.isFinite(r.level)) return null;
  const st = obj(r.stats);
  const level = int(r.level, 1, lim.maxLevel, 1);
  return {
    species: r.species,
    difficulty: diff(r.difficulty),
    level,
    xp: num(r.xp, 0, 1e9, 0),
    hpRatio: num(r.hpRatio, 0.05, 1, 1),
    stamina: num(r.stamina, 0, lim.maxStamina, lim.maxStamina),
    stomachRatio: num(r.stomachRatio, 0, 1, 0.5),
    stomachBank: num(r.stomachBank, 0, 1e9, 0),
    x: num(r.x, 0, lim.worldWidth, lim.worldWidth / 2),
    y: num(r.y, 0, lim.worldHeight, lim.worldHeight / 2),
    runTime: num(r.runTime, 0, 1e7, 0),
    stats: {
      plankton: int(st.plankton, 0, 1e7, 0),
      fish: int(st.fish, 0, 1e7, 0),
      kills: int(st.kills, 0, 1e7, 0),
      maxLevel: int(st.maxLevel, level, lim.maxLevel, level),
    },
  };
}

/**
 * Upgrade steps, one per format change. Each takes the data of version N and
 * returns version N+1. Version 0 = the loose ce.options / ce.best keys used
 * before this save system existed (handled in loadProfile).
 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {
  // 1: (d) => ({ ...d, newField: default }),   // example for version 2
};

export function migrate(v: number, data: unknown): { v: number; data: unknown } {
  let cur = data;
  let ver = v;
  while (ver < SAVE_VERSION) {
    const step = MIGRATIONS[ver];
    if (!step) throw new Error(`no upgrade step from save version ${ver}`);
    cur = step(cur);
    ver++;
  }
  return { v: ver, data: cur };
}

/** Records merge by taking the best of each (used for cloud sync later too). */
export function mergeBest(a: Best, b: Best): Best {
  if (b.level > a.level || (b.level === a.level && b.kills > a.kills)) return { ...b };
  return { ...a };
}

// ------------------------------------------------------------------ manager

export class SaveManager {
  readonly device: string;
  /** Count of writes that failed (storage full or blocked). Shown in diagnostics. */
  failedWrites = 0;
  lastSavedAt = 0;
  /** False when the device refuses storage (private mode, blocked in an app view). */
  readonly persistent: boolean;

  constructor(
    private store: KeyValueStore,
    private limits: SaveLimits,
    private app = '0.0.0',
    private now: () => number = () => Date.now(),
  ) {
    this.persistent = this.probe();
    let dev = this.safeGet(KEYS.device);
    if (!dev) {
      dev = Math.random().toString(36).slice(2, 10);
      this.safeSet(KEYS.device, dev);
    }
    this.device = dev;
  }

  // ---------------------------------------------------------------- profile

  loadProfile(): Loaded<Profile> {
    const got = this.read<Profile>('profile', KEYS.profile, (d) => sanitizeProfile(d));
    if (got.source !== 'default') return got;
    // Nothing saved yet with this system: bring over the older loose keys.
    const legacyOpts = this.parse(this.safeGet(KEYS.legacyOptions));
    const legacyBest = this.parse(this.safeGet(KEYS.legacyBest));
    if (legacyOpts || legacyBest) {
      const profile = sanitizeProfile({ settings: legacyOpts ?? {}, best: legacyBest ?? {} });
      this.saveProfile(profile);
      return { data: profile, savedAt: this.now(), device: this.device, source: 'main' };
    }
    return got;
  }

  saveProfile(p: Profile): boolean {
    return this.write('profile', KEYS.profile, sanitizeProfile(p));
  }

  // ---------------------------------------------------------------- checkpoint

  loadCheckpoint(): Loaded<Checkpoint | null> {
    return this.read<Checkpoint | null>('checkpoint', KEYS.checkpoint, (d) => sanitizeCheckpoint(d, this.limits), null);
  }

  saveCheckpoint(c: Checkpoint): boolean {
    const clean = sanitizeCheckpoint(c, this.limits);
    if (!clean) return false;
    return this.write('checkpoint', KEYS.checkpoint, clean);
  }

  /** The run ended (death, new run): forget it, backup included. */
  clearCheckpoint(): void {
    this.safeRemove(KEYS.checkpoint);
    this.safeRemove(KEYS.checkpoint + '.bak');
  }

  /** Wipe everything this game stores (Options > Reset everything). */
  resetAll(): void {
    for (const k of [KEYS.profile, KEYS.checkpoint, KEYS.legacyOptions, KEYS.legacyBest]) {
      this.safeRemove(k);
      this.safeRemove(k + '.bak');
    }
  }

  /** Export both saves as one text block (for a manual backup). */
  exportAll(): string {
    return JSON.stringify({
      profile: this.parse(this.safeGet(KEYS.profile)),
      checkpoint: this.parse(this.safeGet(KEYS.checkpoint)),
    });
  }

  // ---------------------------------------------------------------- internals

  private write<T>(kind: Envelope<T>['kind'], key: string, data: T): boolean {
    const body = JSON.stringify(data);
    const env: Envelope<T> = {
      v: SAVE_VERSION,
      kind,
      savedAt: this.now(),
      app: this.app,
      device: this.device,
      sum: checksum(body),
      data,
    };
    // Keep the current save as the backup, but only if it is itself valid,
    // so a damaged main slot never overwrites a good backup.
    const current = this.safeGet(key);
    if (current && this.verify(current, kind)) this.safeSet(key + '.bak', current);
    const ok = this.safeSet(key, JSON.stringify(env));
    if (ok) this.lastSavedAt = env.savedAt;
    else this.failedWrites++;
    return ok;
  }

  private read<T>(kind: Envelope<T>['kind'], key: string, clean: (d: unknown) => T | null, fallback?: T): Loaded<T> {
    const def = (fallback !== undefined ? fallback : structuredClone(DEFAULT_PROFILE)) as T;
    let problem: string | undefined;
    for (const [slot, source] of [
      [key, 'main'],
      [key + '.bak', 'backup'],
    ] as const) {
      const raw = this.safeGet(slot);
      if (!raw) continue;
      const env = this.verify(raw, kind);
      if (!env) {
        problem ??= 'Your last save was damaged, so an earlier copy was used.';
        continue;
      }
      let data: unknown;
      try {
        data = migrate(env.v, env.data).data;
      } catch {
        problem ??= 'This save comes from a newer or unknown version of the game.';
        continue;
      }
      const value = clean(data);
      if (value === null) {
        problem ??= 'Your last save could not be read, so an earlier copy was used.';
        continue;
      }
      return { data: value, savedAt: env.savedAt, device: env.device, source, problem: source === 'backup' ? problem : undefined };
    }
    if (problem) problem = 'Your save could not be read, so the game started fresh. Settings are back to default.';
    return { data: def, savedAt: 0, device: this.device, source: 'default', problem };
  }

  /** Parse and check an envelope. Returns null when it is damaged. */
  private verify(raw: string, kind: string): Envelope<unknown> | null {
    const env = this.parse(raw) as Envelope<unknown> | null;
    if (!env || typeof env !== 'object' || env.kind !== kind || typeof env.v !== 'number') return null;
    if (env.v > SAVE_VERSION) return null;
    if (env.sum !== checksum(JSON.stringify(env.data))) return null;
    return env;
  }

  private parse(raw: string | null): unknown {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private probe(): boolean {
    try {
      this.store.setItem('ce.probe', '1');
      this.store.removeItem('ce.probe');
      return true;
    } catch {
      return false;
    }
  }
  private safeGet(k: string): string | null {
    try {
      return this.store.getItem(k);
    } catch {
      return null;
    }
  }
  private safeSet(k: string, v: string): boolean {
    try {
      this.store.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  }
  private safeRemove(k: string): void {
    try {
      this.store.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/** In-memory store, used when the browser blocks storage (and in tests). */
export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  /** Test helper: raw access. */
  raw(k: string) {
    return this.m.get(k);
  }
}
