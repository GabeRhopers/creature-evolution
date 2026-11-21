// Growth formulas from the MVP plan. Pure functions: easy to test and tune.
import { BALANCE, MAX_LEVEL, STAGES, type Species, type StageDef } from '../data';

const g = () => BALANCE.growth;

/** Body radius in world pixels at a given level. */
export function sizeAt(species: Species, level: number): number {
  return species.baseSize * Math.pow(g().sizePerLevel, level - 1);
}

/** How many times bigger than the species' base size. */
export function sizeRatio(species: Species, level: number): number {
  return sizeAt(species, level) / species.baseSize;
}

export function maxHpAt(species: Species, level: number): number {
  return Math.round(species.baseHP * Math.pow(sizeRatio(species, level), g().hpExponent));
}

export function biteDamageAt(species: Species, level: number): number {
  return species.baseBite * Math.pow(sizeRatio(species, level), g().biteExponent);
}

export function xpToNext(level: number): number {
  return Math.round(g().xpBase * Math.pow(level, g().xpExponent));
}

/** Anything with a body radius at or below this can be swallowed whole. */
export function devourSizeAt(species: Species, level: number): number {
  return sizeAt(species, level) * species.devourRatio;
}

/** Bigger fish swim a bit faster in absolute terms... */
export function speedFactor(species: Species, level: number): number {
  return Math.pow(sizeRatio(species, level), g().speedExponent);
}

/** ...but turn more slowly. */
export function turnFactor(species: Species, level: number): number {
  return Math.pow(sizeRatio(species, level), g().turnExponent);
}

// ------------------------------------------------------------------ stages (player)
//
// The player's creature no longer grows without limit. Its level sits inside a
// stage (hatchling, juvenile, adult). Inside a stage the body grows only a
// little; evolving to the next stage is a jump. Two numbers describe it:
//   size  the body: look, physics, mouth, what can be swallowed whole, speed
//   rank  how strong the reef thinks you are: who hunts you, who flees,
//         health and bite. AI fish have rank = size.


export interface Form {
  stage: StageDef | null;
  size: number;
  rank: number;
  /** Strength multiplier for health and bite (rank / base size). */
  power: number;
  devourRatio: number;
}

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
}

export function stageAt(level: number, stages: StageDef[] = STAGES): StageDef {
  const lv = clampLevel(level);
  return stages.find((s) => lv >= s.from && lv <= s.to) ?? stages[stages.length - 1];
}

export function stageIndex(level: number, stages: StageDef[] = STAGES): number {
  return stages.indexOf(stageAt(level, stages));
}

/** Smooth growth between two values across a stage (geometric). */
function across(range: [number, number], s: StageDef, level: number): number {
  const t = s.to > s.from ? (clampLevel(level) - s.from) / (s.to - s.from) : 0;
  return range[0] * Math.pow(range[1] / range[0], Math.max(0, Math.min(1, t)));
}

/** Body, rank and strength at a level. With `staged` = false: the classic formula (AI fish). */
export function formAt(species: Species, level: number, staged: boolean): Form {
  if (!staged) {
    const size = sizeAt(species, level);
    const rank = size * (species.rankMul ?? 1);
    return { stage: null, size, rank, power: rank / species.baseSize, devourRatio: species.devourRatio };
  }
  const s = stageAt(level);
  const size = across(s.body, s, level);
  const rank = across(s.rank, s, level);
  return { stage: s, size, rank, power: rank / species.baseSize, devourRatio: s.devourRatio };
}

/** First level at which the staged creature can swallow something of this size, or null if never. */
export function levelToSwallow(targetSize: number): number | null {
  for (let lv = 1; lv <= MAX_LEVEL; lv++) {
    const s = stageAt(lv);
    if (across(s.body, s, lv) * s.devourRatio >= targetSize) return lv;
  }
  return null;
}
