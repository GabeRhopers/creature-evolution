// Perks: at a few levels the player picks 1 of 3 small, stacking upgrades.
// Pure logic, so it can be unit-tested.
import { BALANCE, lastStageLevel } from '../data';

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
  turn?: number;
  stamina?: number;
}
export interface PerkMods {
  speed: number;
  damageTaken: number;
  bite: number;
  stomach: number;
  hunger: number;
  cooldown: number;
  /** Turning speed multiplier. */
  turn: number;
  /** Sprint stamina drain multiplier (lower = sprint longer). */
  stamina: number;
}

export const PERKS = BALANCE.perks.list as PerkDef[];
export const PERK_LEVELS: number[] = BALANCE.perks.levels;
export const NO_MODS: PerkMods = { speed: 1, damageTaken: 1, bite: 1, stomach: 1, hunger: 1, cooldown: 1, turn: 1, stamina: 1 };

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

/** How strong the hatchling head start is at a level: 1 up to `fullUntil`, fading to 0 at `endsAt`. */
export function earlyHelpStrength(level: number): number {
  const e = BALANCE.earlyHelp;
  if (level <= e.fullUntil) return 1;
  if (level >= e.endsAt) return 0;
  return (e.endsAt - level) / (e.endsAt - e.fullUntil);
}

/** The head start's multipliers at a level (speed, turning, stamina drain, damage taken), on top of the perks. */
export function earlyHelpMods(level: number): PerkMods {
  const e = BALANCE.earlyHelp;
  const k = earlyHelpStrength(level);
  const mix = (v: number) => 1 + (v - 1) * k;
  return { ...NO_MODS, speed: mix(e.speed), turn: mix(e.turn), stamina: mix(e.stamina), damageTaken: mix(e.damageTaken) };
}

/** How many perk picks the player has earned but not made yet. */
/** Picks still to make: earned by levels, plus `bonus` free picks (bosses), minus the ones taken. */
export function perksOwed(level: number, takenCount: number, bonus = 0): number {
  return Math.max(0, perksEarned(level) + bonus - takenCount);
}

/** Perk picks earned by a level: the fixed levels, then one every few Legend levels (33, 36, 39...). */
export function perksEarned(level: number): number {
  const legend = Math.max(0, level - lastStageLevel());
  return PERK_LEVELS.filter((l) => l <= level).length + Math.floor(legend / BALANCE.tides.legendPerkEvery);
}

/** Three different perks to choose from. */
export function offerPerks(rng: () => number = Math.random, count = 3): PerkDef[] {
  const pool = PERKS.slice();
  const out: PerkDef[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
