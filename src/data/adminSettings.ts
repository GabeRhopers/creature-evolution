// Game Settings, first part: enemy settings you can change on this device without code.
//
// Each enemy (every reef creature that spawns, not the heroes) has a few safe numbers. Changes are
// saved on this device (localStorage) and applied to the shared SPECIES / BALANCE data when the game
// starts and when you press Save, so the next swim uses them. "Reset" brings back the shipped values.
import { BALANCE, SPECIES, biomeWeight } from './index';
import { factorsFor, type SpawnFactors } from '../systems/spawnFactors';

export interface EnemyField {
  key: string;
  /** Section on the enemy's page: When, Where, How many, Variety, Strength and behavior. */
  group: string;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  get(id: string): number;
  set(id: string, v: number): void;
}

const pop = BALANCE.population as Record<string, number>;
const biomes = ((BALANCE as unknown as { biomes?: Record<string, Record<string, number>> }).biomes ??= {});
const factors = ((BALANCE as unknown as { spawnFactors?: Record<string, unknown> }).spawnFactors ??= {}) as Record<string, unknown>;
const sp = (id: string) => SPECIES[id] as unknown as Record<string, unknown> & { behavior: Record<string, unknown> };

/** The editable numbers for each enemy, with safe ranges. */
export const ENEMY_FIELDS: EnemyField[] = [
  { key: 'unlockLevel', group: 'When', label: 'Appears from level', help: 'The level when it joins the reef (1 = from the start).', min: 1, max: 200, step: 1,
    get: (id) => Number(sp(id).unlockLevel ?? 1), set: (id, v) => { sp(id).unlockLevel = v <= 1 ? undefined : v; } },
  { key: 'count', group: 'How many', label: 'How many', help: 'How many live in the sea (before difficulty and world size).', min: 0, max: 80, step: 1,
    get: (id) => pop[id] ?? 0, set: (id, v) => { pop[id] = v; } },
  { key: 'aggression', group: 'Strength and behavior', label: 'Aggression', help: '0 = never attacks, 1 = attacks whenever it can.', min: 0, max: 1, step: 0.05,
    get: (id) => Number(sp(id).behavior.aggression), set: (id, v) => { sp(id).behavior.aggression = v; } },
  { key: 'visionRange', group: 'Strength and behavior', label: 'Sees from (px)', help: 'How far it notices you and other fish.', min: 100, max: 900, step: 10,
    get: (id) => Number(sp(id).behavior.visionRange), set: (id, v) => { sp(id).behavior.visionRange = v; } },
  { key: 'maxSpeed', group: 'Strength and behavior', label: 'Top speed', help: 'How fast it swims.', min: 60, max: 400, step: 5,
    get: (id) => Number(sp(id).maxSpeed), set: (id, v) => { sp(id).maxSpeed = v; } },
  { key: 'baseHP', group: 'Strength and behavior', label: 'Health', help: 'Health at level 1 (grows with its level).', min: 5, max: 2000, step: 5,
    get: (id) => Number(sp(id).baseHP), set: (id, v) => { sp(id).baseHP = v; } },
  { key: 'baseBite', group: 'Strength and behavior', label: 'Bite damage', help: 'Damage per bite at level 1 (grows with its level).', min: 1, max: 200, step: 1,
    get: (id) => Number(sp(id).baseBite), set: (id, v) => { sp(id).baseBite = v; } },
  { key: 'rankMul', group: 'Strength and behavior', label: 'Fights above its size', help: '1 = normal. Higher = it fights and hunts like a bigger fish.', min: 1, max: 5, step: 0.1,
    get: (id) => Number(sp(id).rankMul ?? 1), set: (id, v) => { sp(id).rankMul = v <= 1 ? undefined : v; } },
  // Where it lives: one weight per region (balance "biomes"). 0 = never there.
  ...(BALANCE.regions.list as Array<{ id: string; name: string }>).map((r): EnemyField => ({
    key: 'biome_' + r.id, group: 'Where', label: 'In ' + r.name, help: `How much it likes the ${r.name} (0 = never there, 1 = normal, 3 = crowded).`,
    min: 0, max: 3, step: 0.05,
    get: (id) => biomeWeight(id, r.id),
    set: (id, v) => { (biomes[id] ??= {})[r.id] = v; },
  })),
  // Spawn factors (src/systems/spawnFactors.ts): each enemy's own value over balance "spawnDefaults".
  ...SPAWN_FIELDS(),
];

/** Fields for the spawn factors: get = the effective value, set = this enemy's own value. */
function SPAWN_FIELDS(): EnemyField[] {
  const own = (id: string) => ((factors[id] ??= {}) as Record<string, unknown>);
  const f = (key: keyof SpawnFactors, group: string, label: string, help: string, min: number, max: number, step: number): EnemyField => ({
    key: 'sf_' + key, group, label, help, min, max, step,
    get: (id) => Number(factorsFor(id)[key]),
    set: (id, v) => { own(id)[key] = v; },
  });
  const act = (p: 'dawn' | 'day' | 'dusk' | 'night', name: string): EnemyField => ({
    key: 'sf_activity_' + p, group: 'When', label: `Out at ${name}`, help: `Share of them out at ${name} (0 = none, 1 = all).`, min: 0, max: 1, step: 0.05,
    get: (id) => factorsFor(id).activity[p],
    set: (id, v) => { const o = own(id) as { activity?: Record<string, number> }; (o.activity ??= {})[p] = v; },
  });
  return [
    f('lastLevel', 'When', 'Leaves after level', 'It leaves the sea after this level (0 = never).', 0, 200, 1),
    act('dawn', 'dawn'), act('day', 'day'), act('dusk', 'dusk'), act('night', 'night'),
    f('waveEvery', 'When', 'Waves: every (s)', 'It comes in waves every this many seconds (0 = always there).', 0, 600, 10),
    f('waveStay', 'When', 'Waves: stays (s)', 'How long each wave stays.', 0, 600, 5),
    f('respawnDelay', 'When', 'Respawn delay (s)', 'Seconds before an eaten one comes back.', 0, 120, 1),
    { key: 'depthMin', group: 'Where', label: 'Depth from', help: 'Top of the water it lives in (0 = surface, 1 = seabed).', min: 0, max: 1, step: 0.05,
      get: (id) => (SPECIES[id].spawn.depthMin), set: (id, v) => { SPECIES[id].spawn.depthMin = Math.min(v, SPECIES[id].spawn.depthMax - 0.05); } },
    { key: 'depthMax', group: 'Where', label: 'Depth to', help: 'Bottom of the water it lives in.', min: 0, max: 1, step: 0.05,
      get: (id) => (SPECIES[id].spawn.depthMax), set: (id, v) => { SPECIES[id].spawn.depthMax = Math.max(v, SPECIES[id].spawn.depthMin + 0.05); } },
    f('nearPlayer', 'Where', 'Spawns near you', 'Chance a respawn appears just off your screen.', 0, 1, 0.05),
    f('roam', 'Where', 'Roam distance (px)', 'How far it wanders from where it is.', 200, 8000, 100),
    f('perTide', 'How many', 'Extra per Tide', 'Extra share of the count each Tide (0.1 = 10% more each Tide).', 0, 0.5, 0.05),
    f('groupMin', 'How many', 'Group size from', 'Smallest group it spawns in.', 1, 12, 1),
    f('groupMax', 'How many', 'Group size to', 'Biggest group it spawns in.', 1, 20, 1),
    f('maxHunters', 'How many', 'Max hunting you at once', 'At most this many chase you together (0 = no limit).', 0, 10, 1),
    f('levelMin', 'Variety', 'Level from', 'Lowest spawn level (plus the Tide bonus).', 1, 10, 1),
    f('levelMax', 'Variety', 'Level to', 'Highest spawn level (plus the Tide bonus).', 1, 15, 1),
    f('eliteChance', 'Variety', 'Elite chance', 'Chance of a rare golden one.', 0, 0.5, 0.01),
    f('eliteLevels', 'Variety', 'Elite extra levels', 'How many levels stronger an elite is.', 0, 15, 1),
  ];
}

/** The order the sections show on an enemy's page. */
export const ENEMY_GROUPS = ['When', 'Where', 'How many', 'Variety', 'Strength and behavior'];

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
