// Save system, format version 1.
//
// Two kinds of save live on the device:
//   profile    settings, best record, lifetime stats, save slot names (always kept)
//   checkpoint the run in progress (cleared when the run ends), one per save slot
//
// Players: up to MAX_PLAYERS people share a device ("Who's playing?"). Each player
// has their own profile (settings, hero, records) and, for every hero, SLOT_COUNT
// save slots with their own names. A run is saved under player + hero + slot.
// Player 1 keeps the original profile key. Saves from before players existed
// (3 slots shared by every hero) are moved once to player 1, each into a slot of
// the hero it was played with (`migrateToPlayers`). The active player, hero and
// slot are where the game writes; the others are only read for the save lists.
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

import { sanitizePadMap, type PadMap } from '../input/gamepad';

export const SAVE_VERSION = 1;
/** When the 7-region, 114000 px sea went live (Nov 23 2026, 18:40 UTC). */
export const SEVEN_REGIONS_SINCE = Date.UTC(2026, 10, 23, 18, 40);
export const SLOT_COUNT = 5;
/** How many players can share the device. */
export const MAX_PLAYERS = 4;
/** Slots per hero before players existed (they all used one list). */
const OLD_SLOT_COUNT = 3;

export type Difficulty = 'easy' | 'normal' | 'hard';
export type DeathCause = 'swallowed' | 'bitten' | 'starved' | 'dried';

export interface Settings {
  music: boolean;
  sfx: boolean;
  difficulty: Difficulty;
  /** Sprite Studio project used as the player's look (null = the original art). */
  skin: string | null;
  /** Hero picked on the home screen (species id; null = the crocodile). */
  hero: string | null;
  /** Controller buttons per action (null = the default layout). */
  padMap: PadMap | null;
  /** The skin picked for each hero (hero id -> Sprite Studio skin set id, like "sk-mf3k2"); missing = the original look. */
  looks?: Record<string, string>;
  /** The first-minutes coach is done for this player (missing = not yet). */
  coachDone?: boolean;
  /** One-time tips this player has seen (coach tips like 'stomach', 'hunted'). */
  tipsSeen?: string[];
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
  /** Save slots per hero (species id): which one the game uses, and the name of each (renameable). */
  slots: Record<string, HeroSlots>;
}
export interface HeroSlots {
  active: number;
  names: string[];
}
/** Who plays on this device, and who is playing now. */
export interface PlayerList {
  active: number;
  players: Array<{ id: number; name: string }>;
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
  /** Perks picked this run (ids, in order). Older saves have none. */
  perks?: string[];
  /** Level saved by the last Checkpoint Crab defeated (0 or missing = none yet). */
  crabLevel?: number;
  /** Gates between regions broken in this run (ids). Missing = a save from before gates (the whole sea stays open). */
  gatesOpen?: string[];
  /** Seconds into the day-and-night cycle (missing = the run's start time). */
  dayTime?: number;
  /** World width when saved (missing = the 72000 px, 4-region sea; positions are moved to the new layout). */
  worldW?: number;
  /** Bosses beaten in this run (ids); they don't come back. Missing = none. */
  bossesBeaten?: string[];
}

/** What is actually written: the payload plus a header. */
interface Envelope<T> {
  v: number;
  kind: 'profile' | 'checkpoint' | 'players';
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
  /** Playable heroes (species ids): each has its own save slots. */
  heroes: string[];
  maxLevel: number;
  worldWidth: number;
  worldHeight: number;
  maxStamina: number;
}

export const DEFAULT_PROFILE: Profile = {
  settings: { music: true, sfx: true, difficulty: 'normal', skin: null, hero: null, padMap: null },
  best: { level: 0, kills: 0, fish: 0 },
  lifetime: { runs: 0, deaths: { swallowed: 0, bitten: 0, starved: 0, dried: 0 } },
  slots: {},
};
export const DEFAULT_PLAYERS: PlayerList = { active: 1, players: [{ id: 1, name: 'Player 1' }] };

export function defaultSlotNames(): string[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => `Game ${i + 1}`);
}

/** A slot name: trimmed, no control characters, 1 to 24 characters (empty = the default name). */
export function cleanSlotName(v: unknown, slot: number): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
  return s || `Game ${slot}`;
}

/** A player name: trimmed, no control characters, 1 to 16 characters (empty = "Player N"). */
export function cleanPlayerName(v: unknown, id: number): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '';
  return s || `Player ${id}`;
}

/** Check a player list: 1 to MAX_PLAYERS players with unique ids, and an active one that exists. */
export function sanitizePlayers(raw: unknown): PlayerList {
  const r = obj(raw);
  const list = Array.isArray(r.players) ? r.players : [];
  const players: PlayerList['players'] = [];
  for (const p of list) {
    const o = obj(p);
    const id = o.id;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1 || id > MAX_PLAYERS || players.some((x) => x.id === id)) continue;
    players.push({ id, name: cleanPlayerName(o.name, id) });
    if (players.length >= MAX_PLAYERS) break;
  }
  if (!players.length) players.push({ id: 1, name: 'Player 1' });
  const active = players.some((p) => p.id === r.active) ? (r.active as number) : players[0].id;
  return { active, players };
}

/** One hero's slots, checked (old saves had one list for every hero: see migrateToPlayers). */
function sanitizeHeroSlots(raw: unknown): HeroSlots {
  const r = obj(raw);
  const names = Array.isArray(r.names) ? r.names : [];
  return {
    active: int(r.active, 1, SLOT_COUNT, 1),
    names: Array.from({ length: SLOT_COUNT }, (_, i) => cleanSlotName(names[i], i + 1)),
  };
}

const KEYS = {
  profile: 'ce.save.profile',
  checkpoint: 'ce.save.checkpoint',
  players: 'ce.save.players',
  run: 'ce.save.run',
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
  const sl = obj(r.slots);
  const slots: Record<string, HeroSlots> = {};
  // The old shape ({ active, names } for all heroes) is not a hero list: it is dropped here (migrateToPlayers moved it).
  if (!Array.isArray(sl.names))
    for (const [hero, v] of Object.entries(sl)) if (/^[\w-]{1,40}$/.test(hero) && v && typeof v === 'object') slots[hero] = sanitizeHeroSlots(v);
  return {
    settings: {
      music: bool(s.music, true),
      sfx: bool(s.sfx, true),
      difficulty: diff(s.difficulty),
      skin: typeof s.skin === 'string' && /^[\w-]{1,40}$/.test(s.skin) ? s.skin : null,
      hero: typeof s.hero === 'string' && /^[\w-]{1,40}$/.test(s.hero) ? s.hero : null,
      padMap: sanitizePadMap(s.padMap),
      ...sanitizeLooks(s.looks),
      ...(typeof s.coachDone === 'boolean' ? { coachDone: s.coachDone } : {}),
      ...(Array.isArray(s.tipsSeen) ? { tipsSeen: s.tipsSeen.filter((t): t is string => typeof t === 'string' && /^[\w-]{1,20}$/.test(t)).slice(0, 20) } : {}),
    },
    best: { level: int(b.level, 0, 999, 0), kills: int(b.kills, 0, 1e7, 0), fish: int(b.fish, 0, 1e7, 0) },
    lifetime: {
      runs: int(l.runs, 0, 1e7, 0),
      deaths: { swallowed: int(d.swallowed, 0, 1e7, 0), bitten: int(d.bitten, 0, 1e7, 0), starved: int(d.starved, 0, 1e7, 0), dried: int(d.dried, 0, 1e7, 0) },
    },
    slots,
  };
}

/** Hero -> skin set ids: only plain ids are kept; an empty list is left out. */
function sanitizeLooks(v: unknown): { looks?: Record<string, string> } {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [hero, set] of Object.entries(v as Record<string, unknown>))
    if (/^[\w-]{1,40}$/.test(hero) && typeof set === 'string' && /^sk-[\w-]{1,30}$/.test(set)) out[hero] = set;
  return Object.keys(out).length ? { looks: out } : {};
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
    crabLevel: int(r.crabLevel, 0, level, 0),
    ...(Array.isArray(r.gatesOpen) ? { gatesOpen: r.gatesOpen.filter((x): x is string => typeof x === 'string' && /^[a-z_]{2,32}$/.test(x)).slice(0, 20) } : {}),
    ...(typeof r.dayTime === 'number' && Number.isFinite(r.dayTime) ? { dayTime: num(r.dayTime, 0, 1e6, 0) } : {}),
    ...(typeof r.worldW === 'number' && Number.isFinite(r.worldW) ? { worldW: num(r.worldW, 1000, 1e7, 0) } : {}),
    ...(Array.isArray(r.bossesBeaten) ? { bossesBeaten: r.bossesBeaten.filter((x): x is string => typeof x === 'string' && /^[a-z_]{2,32}$/.test(x)).slice(0, 20) } : {}),
    perks: Array.isArray(r.perks) ? r.perks.filter((x): x is string => typeof x === 'string' && /^[a-z]{2,16}$/.test(x)).slice(0, 30) : [],
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
  /** The player, hero and save slot the game reads and writes. */
  private player = 1;
  private hero: string;
  private slot = 1;

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
    this.hero = limits.heroes[0] ?? limits.species[0] ?? 'crocodile';
  }

  // ---------------------------------------------------------------- players

  /** Who plays on this device. The first time, older saves are moved to player 1. */
  loadPlayers(): PlayerList {
    const got = this.read<PlayerList>('players', KEYS.players, (d) => sanitizePlayers(d), DEFAULT_PLAYERS);
    if (got.source !== 'default') return got.data;
    const list = sanitizePlayers(DEFAULT_PLAYERS);
    this.migrateToPlayers();
    this.savePlayers(list);
    return list;
  }

  savePlayers(list: PlayerList): boolean {
    return this.write('players', KEYS.players, sanitizePlayers(list));
  }

  get activePlayer(): number {
    return this.player;
  }

  /** Switch player (only from the home screen; the page reloads with their profile). */
  setPlayer(id: number): void {
    this.player = Math.min(MAX_PLAYERS, Math.max(1, Math.round(id) || 1));
  }

  /** A new player (null when the device is full). Settings like sound and controller buttons are copied from `from`. */
  addPlayer(name: string, from?: Profile): number | null {
    const list = this.loadPlayers();
    if (list.players.length >= MAX_PLAYERS) return null;
    let id = 1;
    while (list.players.some((p) => p.id === id)) id++;
    list.players.push({ id, name: cleanPlayerName(name, id) });
    this.savePlayers(list);
    // A fresh profile (anything left from a player who used this id before is wiped first).
    this.deletePlayerData(id);
    const prof = structuredClone(DEFAULT_PROFILE);
    if (from) prof.settings = { ...prof.settings, music: from.settings.music, sfx: from.settings.sfx, padMap: from.settings.padMap };
    this.write('profile', SaveManager.profileKey(id), sanitizeProfile(prof));
    return id;
  }

  renamePlayer(id: number, name: string): void {
    const list = this.loadPlayers();
    const p = list.players.find((x) => x.id === id);
    if (!p) return;
    p.name = cleanPlayerName(name, id);
    this.savePlayers(list);
  }

  /** Remove a player with their profile and every saved run (the last player can't be removed). */
  deletePlayer(id: number): boolean {
    const list = this.loadPlayers();
    if (list.players.length <= 1 || !list.players.some((p) => p.id === id)) return false;
    list.players = list.players.filter((p) => p.id !== id);
    if (list.active === id) list.active = list.players[0].id;
    this.savePlayers(list);
    this.deletePlayerData(id);
    return true;
  }

  private deletePlayerData(id: number): void {
    const keys = [SaveManager.profileKey(id)];
    for (const h of this.limits.heroes) for (let n = 1; n <= SLOT_COUNT; n++) keys.push(SaveManager.slotKey(n, h, id));
    for (const k of keys) {
      this.safeRemove(k);
      this.safeRemove(k + '.bak');
    }
  }

  /**
   * Before players: one profile and 3 slots shared by every hero. Each saved run moves to player 1, into the
   * next free slot of the hero it was played with, keeping its name (and its backup copy). The old keys go away.
   */
  private migrateToPlayers(): void {
    const prof = this.parse(this.safeGet(KEYS.profile)) as Envelope<Record<string, unknown>> | null;
    const oldSlots = obj(obj(prof?.data).slots);
    const oldNames = Array.isArray(oldSlots.names) ? oldSlots.names : [];
    const oldActive = typeof oldSlots.active === 'number' ? oldSlots.active : 1;
    const slots: Record<string, HeroSlots> = {};
    let activeHero: string | null = null;
    for (let n = 1; n <= OLD_SLOT_COUNT; n++) {
      const key = n === 1 ? KEYS.checkpoint : `${KEYS.checkpoint}.${n}`;
      const main = this.safeGet(key);
      const bak = this.safeGet(key + '.bak');
      const env = (main && this.verify(main, 'checkpoint')) || (bak && this.verify(bak, 'checkpoint'));
      const species = env ? obj(env.data).species : null;
      const hero = typeof species === 'string' && this.limits.heroes.includes(species) ? species : null;
      if (hero) {
        const hs = (slots[hero] ??= sanitizeHeroSlots({}));
        let k = 1;
        while (k <= SLOT_COUNT && this.safeGet(SaveManager.slotKey(k, hero, 1))) k++;
        if (k <= SLOT_COUNT) {
          const to = SaveManager.slotKey(k, hero, 1);
          if (main) this.safeSet(to, main);
          if (bak) this.safeSet(to + '.bak', bak);
          // A name the player chose comes along; a default one ("Game 2") becomes the new slot's default.
          const name = cleanSlotName(oldNames[n - 1], n);
          hs.names[k - 1] = name === `Game ${n}` ? `Game ${k}` : name;
          if (n === oldActive) {
            hs.active = k;
            activeHero = hero;
          }
        }
      }
      this.safeRemove(key);
      this.safeRemove(key + '.bak');
    }
    if (!prof) return;
    const data: Record<string, unknown> = { ...obj(prof.data), slots };
    // The hero whose game was in use stays picked, so CONTINUE still shows it.
    if (activeHero) data.settings = { ...obj(data.settings), hero: activeHero };
    this.write('profile', KEYS.profile, sanitizeProfile(data));
  }

  // ---------------------------------------------------------------- profile

  /** Storage key of a player's profile. Player 1 keeps the original key. */
  static profileKey(player: number): string {
    return player === 1 ? KEYS.profile : `${KEYS.profile}.p${player}`;
  }

  /** The active player's profile. */
  loadProfile(): Loaded<Profile> {
    const got = this.read<Profile>('profile', SaveManager.profileKey(this.player), (d) => sanitizeProfile(d));
    if (got.source !== 'default' || this.player !== 1) return got;
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
    return this.write('profile', SaveManager.profileKey(this.player), sanitizeProfile(p));
  }

  // ---------------------------------------------------------------- save slots

  get activeSlot(): number {
    return this.slot;
  }

  get activeHero(): string {
    return this.hero;
  }

  /** Switch the slot the game reads and writes (only from the home screen, never mid-run). */
  setSlot(n: number): void {
    this.slot = Math.min(SLOT_COUNT, Math.max(1, Math.round(n) || 1));
  }

  /** Switch the hero whose slots the game reads and writes (only from the home screen). */
  setHero(hero: string): void {
    if (this.limits.heroes.includes(hero)) this.hero = hero;
  }

  /** Storage key of a run: player, hero and slot. */
  static slotKey(n: number, hero: string, player: number): string {
    return `${KEYS.run}.p${player}.${hero}.${n}`;
  }

  // ---------------------------------------------------------------- checkpoint

  /** The run saved in the active slot (or in slot `n`, for the save list). */
  loadCheckpoint(n = this.slot, hero = this.hero): Loaded<Checkpoint | null> {
    const got = this.read<Checkpoint | null>('checkpoint', SaveManager.slotKey(n, hero, this.player), (d) => sanitizeCheckpoint(d, this.limits), null);
    // Saves written by v0.42-0.44 lost their world width (the field was not kept): they are already in the
    // 7-region layout, so they must not be moved again. Anything older is from the 72000 px sea.
    if (got.data && got.data.worldW === undefined && got.savedAt >= SEVEN_REGIONS_SINCE) got.data.worldW = 114000;
    return got;
  }

  saveCheckpoint(c: Checkpoint): boolean {
    const clean = sanitizeCheckpoint(c, this.limits);
    if (!clean) return false;
    return this.write('checkpoint', SaveManager.slotKey(this.slot, this.hero, this.player), clean);
  }

  /** The run ended (death, new run) or the player deleted the slot: forget it, backup included. */
  clearCheckpoint(n = this.slot, hero = this.hero): void {
    this.safeRemove(SaveManager.slotKey(n, hero, this.player));
    this.safeRemove(SaveManager.slotKey(n, hero, this.player) + '.bak');
  }

  /** Wipe everything this game stores (Options > Reset everything). */
  resetAll(): void {
    for (let id = 1; id <= MAX_PLAYERS; id++) this.deletePlayerData(id);
    const old = Array.from({ length: OLD_SLOT_COUNT }, (_, i) => (i === 0 ? KEYS.checkpoint : `${KEYS.checkpoint}.${i + 1}`));
    for (const k of [KEYS.players, ...old, KEYS.legacyOptions, KEYS.legacyBest]) {
      this.safeRemove(k);
      this.safeRemove(k + '.bak');
    }
  }

  /** Export every save as one text block (for a manual backup). */
  exportAll(): string {
    const players = this.loadPlayers();
    return JSON.stringify({
      players,
      profiles: players.players.map((p) => this.parse(this.safeGet(SaveManager.profileKey(p.id)))),
      runs: Object.fromEntries(
        players.players.flatMap((p) =>
          this.limits.heroes.flatMap((h) =>
            Array.from({ length: SLOT_COUNT }, (_, i) => SaveManager.slotKey(i + 1, h, p.id))
              .map((k) => [k, this.parse(this.safeGet(k))] as const)
              .filter(([, v]) => v),
          ),
        ),
      ),
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
