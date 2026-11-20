// Central access to the JSON content files.
// Game code reads tuning values from here, never from hard-coded numbers,
// so balance changes happen in src/data/*.json without touching logic.
import speciesJson from './species.json';
import balanceJson from './balance.json';
import difficultyJson from './difficulty.json';

export interface SpeciesBehavior {
  schooling: boolean;
  aggression: number;
  visionRange: number;
  fleeRatio: number;
}

export interface SpeciesSpawn {
  depthMin: number;
  depthMax: number;
  weight: number;
}

export interface Species {
  id: string;
  displayName: string;
  sprite: string;
  tier: number;
  baseSize: number;
  baseHP: number;
  baseBite: number;
  accel: number;
  maxSpeed: number;
  sprintMultiplier: number;
  drag: number;
  turnSpeed: number;
  devourRatio: number;
  xpValue: number;
  diet: string[];
  behavior: SpeciesBehavior;
  ability: string | null;
  spawn: SpeciesSpawn;
}

export type Balance = typeof balanceJson;
export type DifficultyName = keyof typeof difficultyJson;
export type Difficulty = (typeof difficultyJson)['normal'];

// Objects are shared and mutable on purpose: the in-game tuning panel
// edits them live while you play.
export const SPECIES: Record<string, Species> = Object.fromEntries(
  Object.entries(speciesJson).map(([id, s]) => [id, { id, ...s } as Species]),
);

export const BALANCE: Balance = balanceJson;
export const DIFFICULTY: Record<DifficultyName, Difficulty> = difficultyJson;

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species "${id}" (check src/data/species.json)`);
  return s;
}
