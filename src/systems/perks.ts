// Perks: at a few levels the player picks 1 of 3 small, stacking upgrades.
// Pure logic, so it can be unit-tested.
import { BALANCE } from '../data';

export interface PerkDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  speed?: number;
  damageTaken?: number;
  bite?: number;
  stomach?: number;
  hunger?: number;
  cooldown?: number;
}
export interface PerkMods {
  speed: number;
  damageTaken: number;
  bite: number;
  stomach: number;
  hunger: number;
  cooldown: number;
}

export const PERKS = BALANCE.perks.list as PerkDef[];
export const PERK_LEVELS: number[] = BALANCE.perks.levels;
export const NO_MODS: PerkMods = { speed: 1, damageTaken: 1, bite: 1, stomach: 1, hunger: 1, cooldown: 1 };

export function perkById(id: string): PerkDef | undefined {
  return PERKS.find((p) => p.id === id);
}

/** Combined effect of the perks taken (they stack by multiplying). */
export function perkMods(taken: string[]): PerkMods {
  const m = { ...NO_MODS };
  for (const id of taken) {
    const p = perkById(id);
    if (!p) continue;
    for (const k of Object.keys(m) as Array<keyof PerkMods>) if (typeof p[k] === 'number') m[k] *= p[k] as number;
  }
  return m;
}

/** How many perk picks the player has earned but not made yet. */
export function perksOwed(level: number, takenCount: number): number {
  return Math.max(0, PERK_LEVELS.filter((l) => l <= level).length - takenCount);
}

/** Three different perks to choose from. */
export function offerPerks(rng: () => number = Math.random, count = 3): PerkDef[] {
  const pool = PERKS.slice();
  const out: PerkDef[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
