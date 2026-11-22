// Game Settings, first part: enemy settings you can change on this device without code.
//
// Each enemy (every reef creature that spawns, not the heroes) has a few safe numbers. Changes are
// saved on this device (localStorage) and applied to the shared SPECIES / BALANCE data when the game
// starts and when you press Save, so the next swim uses them. "Reset" brings back the shipped values.
import { BALANCE, SPECIES } from './index';

export interface EnemyField {
  key: string;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  get(id: string): number;
  set(id: string, v: number): void;
}

const pop = BALANCE.population as Record<string, number>;
const sp = (id: string) => SPECIES[id] as unknown as Record<string, unknown> & { behavior: Record<string, unknown> };

/** The editable numbers for each enemy, with safe ranges. */
export const ENEMY_FIELDS: EnemyField[] = [
  { key: 'unlockLevel', label: 'Appears from level', help: 'The level when it joins the reef (1 = from the start).', min: 1, max: 200, step: 1,
    get: (id) => Number(sp(id).unlockLevel ?? 1), set: (id, v) => { sp(id).unlockLevel = v <= 1 ? undefined : v; } },
  { key: 'count', label: 'How many', help: 'How many live in the sea (before difficulty and world size).', min: 0, max: 80, step: 1,
    get: (id) => pop[id] ?? 0, set: (id, v) => { pop[id] = v; } },
  { key: 'aggression', label: 'Aggression', help: '0 = never attacks, 1 = attacks whenever it can.', min: 0, max: 1, step: 0.05,
    get: (id) => Number(sp(id).behavior.aggression), set: (id, v) => { sp(id).behavior.aggression = v; } },
  { key: 'visionRange', label: 'Sees from (px)', help: 'How far it notices you and other fish.', min: 100, max: 900, step: 10,
    get: (id) => Number(sp(id).behavior.visionRange), set: (id, v) => { sp(id).behavior.visionRange = v; } },
  { key: 'maxSpeed', label: 'Top speed', help: 'How fast it swims.', min: 60, max: 400, step: 5,
    get: (id) => Number(sp(id).maxSpeed), set: (id, v) => { sp(id).maxSpeed = v; } },
  { key: 'baseHP', label: 'Health', help: 'Health at level 1 (grows with its level).', min: 5, max: 2000, step: 5,
    get: (id) => Number(sp(id).baseHP), set: (id, v) => { sp(id).baseHP = v; } },
  { key: 'baseBite', label: 'Bite damage', help: 'Damage per bite at level 1 (grows with its level).', min: 1, max: 200, step: 1,
    get: (id) => Number(sp(id).baseBite), set: (id, v) => { sp(id).baseBite = v; } },
  { key: 'rankMul', label: 'Fights above its size', help: '1 = normal. Higher = it fights and hunts like a bigger fish.', min: 1, max: 5, step: 0.1,
    get: (id) => Number(sp(id).rankMul ?? 1), set: (id, v) => { sp(id).rankMul = v <= 1 ? undefined : v; } },
];

/** Enemies = species that spawn in the sea (have a population entry). */
export function enemyIds(): string[] {
  return Object.keys(pop).filter((id) => SPECIES[id]);
}

const KEY = 'ce.admin.enemies';
type Saved = Record<string, Record<string, number>>;
/** The shipped values, captured once before any change, for Reset. */
const shipped: Saved = {};
for (const id of enemyIds()) shipped[id] = Object.fromEntries(ENEMY_FIELDS.map((f) => [f.key, f.get(id)]));

export function shippedValue(id: string, key: string): number {
  return shipped[id]?.[key] ?? 0;
}

function read(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** Apply saved changes (clamped to the safe ranges). Called once at start and after each save. */
export function applyEnemySettings(): void {
  const saved = read();
  for (const id of enemyIds()) {
    for (const f of ENEMY_FIELDS) {
      const raw = saved[id]?.[f.key];
      const v = typeof raw === 'number' && Number.isFinite(raw) ? Math.min(f.max, Math.max(f.min, raw)) : shipped[id][f.key];
      f.set(id, v);
    }
  }
}

/** Save one enemy's values (only the ones that differ from shipped). */
export function saveEnemy(id: string, values: Record<string, number>): void {
  const saved = read();
  const diff: Record<string, number> = {};
  for (const f of ENEMY_FIELDS) {
    const v = values[f.key];
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v - shipped[id][f.key]) > 1e-9) diff[f.key] = Math.min(f.max, Math.max(f.min, v));
  }
  if (Object.keys(diff).length) saved[id] = diff;
  else delete saved[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage blocked: the change still applies until the page closes */
  }
  applyEnemySettings();
}

export function resetEnemies(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  applyEnemySettings();
}

/** True if any enemy has changed values on this device. */
export function enemiesChanged(): boolean {
  return Object.keys(read()).length > 0;
}

/** All changes as a file (to share or keep). */
export function exportEnemySettings(): string {
  return JSON.stringify({ kind: 'creature-evolution-enemies', v: 1, enemies: read() }, null, 2);
}
