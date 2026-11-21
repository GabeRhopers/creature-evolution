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
    /** Left behind when it dies (a skeleton). */
    dead?: string;
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
  /** Sprite Studio starter design used as this species' look (studio/seeds/<look>.json). */
  look?: string;
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

/** Stage abilities. lunge and dart are dashes; roll and crush grab one fish; slam hits every fish around you. */
export type AbilityId = 'shell' | 'lunge' | 'roll' | 'dart' | 'slam' | 'crush';

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
  ability: AbilityId;
  /** Deepest the stage can swim, as a share of the water (1 = the seabed). */
  maxDepth: number;
}

export interface AreaDef {
  id: string;
  name: string;
  from: number;
  to: number;
}
export const AREAS = BALANCE.areas.list as AreaDef[];

/** The area at a depth share (0 = surface, 1 = seabed). */
export function areaAt(depth: number): AreaDef {
  return AREAS.find((a) => depth >= a.from && depth < a.to) ?? AREAS[AREAS.length - 1];
}
/** The crocodile's stages, as written in balance.json. */
const BASE_STAGES = BALANCE.stages.list as StageDef[];

/** A playable hero (balance.json "heroes"): its species id is the key. */
export interface HeroDef {
  id: string;
  name: string;
  blurb: string;
  /** Per-stage changes on top of the shared stages (design, ability, art geometry). */
  stages: Record<string, Partial<Pick<StageDef, 'skin' | 'ability' | 'art'>>>;
}
export const HEROES: HeroDef[] = Object.entries(BALANCE.heroes as Record<string, unknown>)
  .filter(([k]) => !k.startsWith('_'))
  .map(([id, h]) => ({ id, ...(h as Omit<HeroDef, 'id'>) }));
export const DEFAULT_HERO = BALANCE.playerSpecies as string;

export function isHero(id: unknown): id is string {
  return typeof id === 'string' && HEROES.some((h) => h.id === id);
}

/** A hero's stages: the shared levels, sizes and depths with its own designs and abilities. */
export function heroStages(heroId: string): StageDef[] {
  const hero = HEROES.find((h) => h.id === heroId);
  return BASE_STAGES.map((s) => ({ ...s, ...(hero?.stages[s.id] ?? {}) }));
}

/**
 * The stages of the hero being played. Growth code reads this array, so
 * setHero() swaps its contents in place (the array itself never changes).
 */
export const STAGES: StageDef[] = heroStages(DEFAULT_HERO);
let activeHero = DEFAULT_HERO;
export function setHero(heroId: string): void {
  activeHero = isHero(heroId) ? heroId : DEFAULT_HERO;
  STAGES.splice(0, STAGES.length, ...heroStages(activeHero));
}
export function getHero(): string {
  return activeHero;
}
/** Every stage design of every hero (to preload them all). */
export const ALL_STAGE_SKINS: string[] = [...new Set(HEROES.flatMap((h) => heroStages(h.id).map((s) => s.skin)))];
export const MAX_LEVEL: number = BALANCE.stages.maxLevel;
