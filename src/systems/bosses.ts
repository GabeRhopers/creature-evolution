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
  /** Where its cave entrance sits on the seabed (world x). */
  entranceX: number;
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

/** Boss arenas (balance.json bosses.arena): a separate screen, a closed cave below the world. */
export interface ArenaConfig {
  width: number;
  height: number;
  /** How far below the bottom of the world the arena sits. */
  gapBelowWorld: number;
  /** Rock wall thickness around the open water (world px). */
  wall: number;
  /** Where the air pocket in the ceiling is (share of the width from the left). */
  airPocketAt: number;
  /** The EXIT tunnel on the left wall. */
  exitWidth: number;
  exitHeight: number;
  /** Swim this close to the entrance and the game asks; after "Not now" it asks again once you were this far away. */
  enterRadius: number;
  askAgainRadius: number;
  /** Losing inside: you wake at the entrance with this share of your health, safe for a few seconds. */
  lossHpFraction: number;
  lossInvulnSeconds: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface ArenaLayout {
  /** The whole arena, walls included (what the camera shows). */
  outer: Box;
  /** The open water inside the walls (swimmers are kept in it). */
  inner: Box;
  /** The air pocket the boss swims up to. */
  air: { x: number; y: number };
  /** The EXIT tunnel on the left. */
  exit: Box;
  /** Where you appear when you come in. */
  start: { x: number; y: number };
  /** Where the boss waits. */
  boss: { x: number; y: number };
}

/** Where a boss's arena is: below the world, under its cave entrance. */
export function arenaLayout(d: BossDef, cfg: ArenaConfig, worldHeight: number): ArenaLayout {
  const outer = { x: d.entranceX - cfg.width / 2, y: worldHeight + cfg.gapBelowWorld, w: cfg.width, h: cfg.height };
  const inner = { x: outer.x + cfg.wall, y: outer.y + cfg.wall, w: outer.w - cfg.wall * 2, h: outer.h - cfg.wall * 2 };
  const exit = { x: inner.x, y: inner.y + inner.h / 2 - cfg.exitHeight / 2, w: cfg.exitWidth, h: cfg.exitHeight };
  return {
    outer,
    inner,
    air: { x: outer.x + outer.w * cfg.airPocketAt, y: inner.y + 30 },
    exit,
    start: { x: exit.x + exit.w + 220, y: inner.y + inner.h / 2 },
    boss: { x: inner.x + inner.w * 0.7, y: inner.y + inner.h / 2 },
  };
}

/** Is (x, y) inside a box? */
export function inBox(x: number, y: number, b: Box): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** Keep a circle of radius r inside a box (returns the corrected position). */
export function clampToBox(x: number, y: number, r: number, b: Box): { x: number; y: number } {
  return { x: Math.min(b.x + b.w - r, Math.max(b.x + r, x)), y: Math.min(b.y + b.h - r, Math.max(b.y + r, y)) };
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
