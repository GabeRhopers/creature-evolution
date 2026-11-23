// Spawn factors: when, where, how many and how varied each enemy appears (balance.json "spawnFactors",
// on top of "spawnDefaults"). Region weights live in "biomes" and depths in species.json "spawn".
// Pure rules here (unit tested); GameScene applies them.
import { BALANCE } from '../data';

export type PeriodId = 'dawn' | 'day' | 'dusk' | 'night';

export interface SpawnFactors {
  /** It leaves the sea after this level (0 = never). */
  lastLevel: number;
  /** Share of them out at each time of day (0..1). */
  activity: Record<PeriodId, number>;
  /** Waves: shows up every waveEvery seconds and stays waveStay seconds (0 = always there). */
  waveEvery: number;
  waveStay: number;
  /** Seconds before an eaten one comes back. */
  respawnDelay: number;
  /** Chance (0..1) that a respawn appears just off the player's screen. */
  nearPlayer: number;
  /** How far (px) it wanders from where it is, while it is in a region it likes. */
  roam: number;
  /** Extra share of the count for each Tide after the first (0.1 = 10% more each Tide). */
  perTide: number;
  /** Group size when spawning: pairs, packs, schools. */
  groupMin: number;
  groupMax: number;
  /** At most this many hunt the player at once (0 = no limit). */
  maxHunters: number;
  /** Spawn levels (plus the Tide bonus). */
  levelMin: number;
  levelMax: number;
  /** Chance (0..1) of a rare elite: more levels and a golden tint. */
  eliteChance: number;
  eliteLevels: number;
}

type Partial2 = Partial<Omit<SpawnFactors, 'activity'>> & { activity?: Partial<Record<PeriodId, number>> };
const cfg = () => BALANCE as unknown as { spawnDefaults: SpawnFactors; spawnFactors?: Record<string, Partial2> };

/** The factors for a species (its own values over the defaults). */
export function factorsFor(id: string): SpawnFactors {
  const d = cfg().spawnDefaults;
  const o = cfg().spawnFactors?.[id] ?? {};
  return { ...d, ...o, activity: { ...d.activity, ...(o.activity ?? {}) } } as SpawnFactors;
}

/** How many of a species live in the sea in a Tide (before difficulty and world size). */
export function countInTide(base: number, f: SpawnFactors, tide: number): number {
  return base * (1 + Math.max(0, f.perTide) * Math.max(0, tide - 1));
}

/** Is the wave on at this time (seconds into the run)? Always on without waves. */
export function waveOn(f: SpawnFactors, t: number): boolean {
  if (f.waveEvery <= 0 || f.waveStay <= 0) return true;
  return t % f.waveEvery < f.waveStay;
}

/** Share of the species out right now (0..1): time of day, waves, and its last level. */
export function outShare(f: SpawnFactors, period: PeriodId, t: number, playerLevel: number): number {
  if (f.lastLevel > 0 && playerLevel > f.lastLevel) return 0;
  if (!waveOn(f, t)) return 0;
  return Math.max(0, Math.min(1, f.activity[period] ?? 1));
}

/** Split n fish into group sizes between groupMin and groupMax. */
export function groupSizes(n: number, f: SpawnFactors, rand: () => number = Math.random): number[] {
  const lo = Math.max(1, Math.round(f.groupMin)), hi = Math.max(lo, Math.round(f.groupMax));
  const out: number[] = [];
  let left = Math.max(0, Math.round(n));
  while (left > 0) {
    const g = Math.min(left, lo + Math.floor(rand() * (hi - lo + 1)));
    out.push(g);
    left -= g;
  }
  return out;
}

/** A spawn level (plus the Tide bonus), and whether it is an elite. */
export function rollLevel(f: SpawnFactors, bonus: number, rand: () => number = Math.random): { level: number; elite: boolean } {
  const lo = Math.max(1, Math.round(f.levelMin)), hi = Math.max(lo, Math.round(f.levelMax));
  const base = lo + Math.floor(rand() * (hi - lo + 1)) + bonus;
  const elite = rand() < f.eliteChance;
  return { level: base + (elite ? Math.max(0, Math.round(f.eliteLevels)) : 0), elite };
}
