/**
 * Region twists: each region of the sea plays a little differently, not only looks different.
 * Numbers live in balance.json "regionTwists" (a region left out, or a field left out, is 1 = no change).
 *
 * - vision:   how far every fish sees there (murky Swamp water: everyone sees less).
 * - food:     how much plankton drifts there.
 * - hunger:   how fast the player's stomach empties (hot or cold water makes you hungrier).
 * - speed:    the player's top speed (cold water: a little slower).
 * - ventHeal: how much more a warm vent heals there.
 * - ventWarms: true if resting by a warm vent cancels the region's hunger and speed twist (Frozen Sea).
 */
import balance from '../data/balance.json';

export interface RegionTwist {
  vision: number;
  food: number;
  hunger: number;
  speed: number;
  ventHeal: number;
  ventWarms: boolean;
  /** One short line for the region banner (empty = none). */
  hint: string;
}

const NONE: RegionTwist = { vision: 1, food: 1, hunger: 1, speed: 1, ventHeal: 1, ventWarms: false, hint: '' };

type Raw = Partial<RegionTwist> & { _comment?: string };

export function twistFor(region: string | undefined, table: Record<string, Raw | string> = (balance as { regionTwists?: Record<string, Raw | string> }).regionTwists ?? {}): RegionTwist {
  const raw = region ? table[region] : undefined;
  if (!raw || typeof raw === 'string') return NONE;
  return { ...NONE, ...raw };
}

/** The player's twist right now: by a warm vent in a region where vents warm you, the hunger and speed twist is gone. */
export function playerTwist(t: RegionTwist, inVent: boolean): { hunger: number; speed: number } {
  if (inVent && t.ventWarms) return { hunger: 1, speed: 1 };
  return { hunger: t.hunger, speed: t.speed };
}
