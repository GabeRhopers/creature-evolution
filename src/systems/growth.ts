// Growth formulas from the MVP plan. Pure functions: easy to test and tune.
import { BALANCE, type Species } from '../data';

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
