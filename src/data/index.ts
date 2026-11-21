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

/** Optional per-species art info (defaults fit the 128px Kenney fish). */
export interface SpeciesArt {
  /** Body circle radius in frame pixels (scale = size / radius). */
  radius: number;
  /** Mouth center distance ahead of the body center, in body radii. */
  mouthReach?: number;
  /** Mouth radius in body radii. */
  mouthRadius?: number;
  /** Animation frames in the atlas. */
  frames?: {
    swim: string[];
    bite?: string;
    /** Lying flat: used while digesting. */
    rest?: string;
    /** Standing-still animation (plays when not moving). */
    idle?: string[];
    /** Idle with eyes closed, shown briefly every few seconds. */
    blink?: string;
    /** Shown for a moment after being hit. */
    damage?: string;
    /** Several bite frames played in order. */
    biteSeq?: string[];
    /** Played on level-up. */
    celebrate?: string[];
  };
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
  art?: SpeciesArt;
  /** Damage reduction 0..1 (thick hide). */
  armor?: number;
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

/** A growth stage of the player's creature (see balance.json "stages"). */
export interface StageDef {
  id: string;
  name: string;
  from: number;
  to: number;
  /** Body radius at the first and last level of the stage. */
  body: [number, number];
  /** Food-chain rank at the first and last level of the stage. */
  rank: [number, number];
  devourRatio: number;
  /** Sprite Studio project with this stage's look. */
  skin: string;
  art: { radius: number; mouthReach: number; mouthRadius: number };
  ability: 'shell' | 'lunge' | 'roll';
}
export const STAGES = BALANCE.stages.list as StageDef[];
export const MAX_LEVEL: number = BALANCE.stages.maxLevel;
