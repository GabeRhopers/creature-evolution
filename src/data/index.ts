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
  /** Lurks almost still, then lunges at prey that comes close (moray eel). */
  ambush?: boolean;
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
    /** Index in biteSeq of the widest-open frame (the jaws snap shut after it). Default: the last one. */
    biteOpen?: number;
    /** Left behind when it dies (a skeleton). */
    dead?: string;
    /** Played on level-up. */
    celebrate?: string[];
    /** Frames per second per pose, from Sprite Studio. */
    fps?: { idle?: number; swim?: number; celebrate?: number };
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
  /** Never tilts with its heading (the front-view crab): only turns left and right. */
  upright?: boolean;
  /** Only appears once the player reaches this level (a new enemy). */
  unlockLevel?: number;
  /** Short line shown when it first appears. */
  intro?: string;
  /** Venomous: biting or swallowing it costs the player this share of max health (lionfish). */
  venom?: number;
  /** AI strength = size x rankMul (a slim fish that fights above its size). Default 1. */
  rankMul?: number;
  /** Damage reduction 0..1 (thick hide). */
  armor?: number;
  /** A glowing lure (anglerfish): where it sits, in body radii from the body center, facing right. */
  lure?: [number, number];
  /** See-through (jellyfish): drawn at this alpha. */
  alpha?: number;
  /** Camouflage (octopus): fades and hides from fish farther away while it sits still. */
  camo?: boolean;
  /** A friend (green sea turtle): the player can't eat or bite it, and no fish hunts it. */
  friendly?: boolean;
  /** Bioluminescent (Twilight Trench): a soft glow of this color on its body, brighter in the dark. */
  glow?: string;
  /** Vampire squid: scared by the player, it puffs a glowing cloud that blinds you for this many seconds. */
  cloud?: number;
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

/** Stage abilities. lunge and dart are dashes; roll and crush grab one fish; slam hits every fish around you; frenzy is a short power-up. */
export type AbilityId = 'shell' | 'lunge' | 'roll' | 'dart' | 'slam' | 'crush' | 'frenzy';

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
/** Every reef creature design (fish, crab, enemies): Sprite Studio project ids. */
/** Looks of creatures that are not swimmers (the Fisher Ape in his boat). */
export const EXTRA_LOOKS = ['beast-fisher_ape'];
export const ALL_SPECIES_LOOKS: string[] = [...new Set([...Object.values(SPECIES).map((sp) => sp.look).filter((l): l is string => !!l), ...EXTRA_LOOKS])];
/** How much a species likes a region (balance "biomes"; missing = 1). */
export function biomeWeight(speciesId: string, regionId: string): number {
  const b = (BALANCE as unknown as { biomes?: Record<string, Record<string, number>> }).biomes?.[speciesId];
  const v = b?.[regionId];
  return typeof v === 'number' && v >= 0 ? v : 1;
}
export const MAX_LEVEL: number = BALANCE.stages.maxLevel;

// ------------------------------------------------------------------ tides (endless levels)
const TIDES = BALANCE.tides;
/** The Tide (chapter of 10 levels) a level belongs to: levels 1 to 10 = Tide 1. */
export function tideOf(level: number): number {
  return Math.max(1, Math.ceil(level / TIDES.levelsPerTide));
}
/** A Tide's name; after the list runs out, themes come back as harder "+" versions. */
export function tideName(tide: number): string {
  const n = TIDES.themes.length;
  const plus = Math.floor((tide - 1) / n);
  return TIDES.themes[(tide - 1) % n] + '+'.repeat(plus);
}
/** Last level of the last stage (the adult): Legend levels start after it. */
export function lastStageLevel(): number {
  return BASE_STAGES[BASE_STAGES.length - 1].to;
}
/** Legend level (0 before it starts): level 31 = Legend 1. */
export function legendLevel(level: number): number {
  return Math.max(0, level - lastStageLevel());
}
/** How many levels higher reef fish spawn in this Tide. */
export function aiLevelBonus(level: number): number {
  return Math.min(TIDES.aiLevelBonusMax, (tideOf(level) - 1) * TIDES.aiLevelsPerTide);
}
