// Boss rules (balance.json "bosses"): pure data types and helpers, unit tested. The fight lives in
// src/scenes/BossSystem.ts.

export type BossMode = 'hunt' | 'charge' | 'rise' | 'gulp';

export interface BossDef {
  id: string;
  name: string;
  species: string;
  cave: string;
  /** Appears once the player reaches this level. */
  level: number;
  /** The cave chamber's x range. */
  left: number;
  right: number;
  /** x of the hole in the cave roof where it breathes. */
  airX: number;
  /** It wakes when you come this close to the cave. */
  wakeRange: number;
  /** Beyond this far outside the cave the fight pauses and it heals. */
  leash: number;
  hitsToDefeat: number;
  sizeRatio: number;
  biteHpFraction: number;
  biteStunSeconds: number;
  regenPerSecond: number;
  shock: { every: number; telegraph: number; radius: number; hpFraction: number; stunSeconds: number };
  breath: { every: number; gulp: number; riseLimit: number; damageMul: number };
  leap: { belowHealth: number; radius: number; hpFraction: number };
  rewardLevels: number;
  /** Free perk picks for beating it (on top of the ones earned by levels). */
  rewardPerks?: number;
  trophy: string;
  trophyShockMul: number;
}

/** 1 = full moves, 2 = below `leap.belowHealth` (faster shocks, leap shock at the air hole). */
export function bossPhase(healthRatio: number, d: BossDef): 1 | 2 {
  return healthRatio <= d.leap.belowHealth ? 2 : 1;
}

/** Is a player at x close enough to the cave for the fight to be on? */
export function inLeash(x: number, d: BossDef): boolean {
  return x > d.left - d.leash && x < d.right + d.leash;
}

/** Bosses beaten in a saved run (unknown ids dropped; older saves have none). */
export function beatenFromSave(saved: string[] | undefined, all: BossDef[]): string[] {
  if (!Array.isArray(saved)) return [];
  const ids = new Set(all.map((b) => b.id));
  return saved.filter((id) => ids.has(id));
}

/** Damage multiplier on shocks from the trophies you hold (each beaten boss gives its trophy). */
export function shockMul(beaten: string[], all: BossDef[]): number {
  return all.filter((b) => beaten.includes(b.id)).reduce((m, b) => m * b.trophyShockMul, 1);
}

/** Free perk picks earned by the bosses beaten in this run. */
export function bossPerks(beaten: string[], defs: BossDef[]): number {
  return defs.filter((d) => beaten.includes(d.id)).reduce((n, d) => n + Math.max(0, Math.round(d.rewardPerks ?? 0)), 0);
}
