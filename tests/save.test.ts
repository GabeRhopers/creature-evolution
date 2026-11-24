import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  MemoryStore,
  SaveManager,
  checksum,
  mergeBest,
  migrate,
  sanitizeCheckpoint,
  sanitizeProfile,
  sanitizePlayers,
  type Checkpoint,
  type SaveLimits,
} from '../src/save/SaveManager';

const LIM: SaveLimits = { species: ['crocodile', 'mosa', 'blue_tang'], heroes: ['crocodile', 'mosa'], maxLevel: 99, worldWidth: 6000, worldHeight: 3000, maxStamina: 100 };

const CP: Checkpoint = {
  species: 'crocodile',
  difficulty: 'normal',
  level: 7,
  xp: 12.5,
  hpRatio: 0.8,
  stamina: 60,
  stomachRatio: 0.4,
  stomachBank: 30,
  x: 1200,
  y: 800,
  runTime: 140,
  stats: { plankton: 40, fish: 9, kills: 2, maxLevel: 7 },
};

/** Player 1's crocodile, slot 1. */
const RUN1 = 'ce.save.run.p1.crocodile.1';

function fresh(store = new MemoryStore(), t = 1000) {
  return { store, sm: new SaveManager(store, LIM, '0.7.0', () => t) };
}

describe('profile', () => {
  it('returns defaults on a new device', () => {
    const { sm } = fresh();
    const p = sm.loadProfile();
    expect(p.source).toBe('default');
    expect(p.problem).toBeUndefined();
    expect(p.data).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips', () => {
    const { store, sm } = fresh();
    const prof = structuredClone(DEFAULT_PROFILE);
    prof.settings.music = false;
    prof.best = { level: 9, kills: 3, fish: 20 };
    expect(sm.saveProfile(prof)).toBe(true);
    const again = new SaveManager(store, LIM).loadProfile();
    expect(again.source).toBe('main');
    expect(again.data.settings.music).toBe(false);
    expect(again.data.best.level).toBe(9);
  });

  it('brings over the old loose keys (version 0)', () => {
    const store = new MemoryStore();
    store.setItem('ce.options', JSON.stringify({ music: false, sfx: true, difficulty: 'hard' }));
    store.setItem('ce.best', JSON.stringify({ level: 5, kills: 1, fish: 4 }));
    const { sm } = fresh(store);
    const p = sm.loadProfile();
    expect(p.data.settings).toEqual({ music: false, sfx: true, difficulty: 'hard', skin: null, hero: null, padMap: null });
    expect(p.data.best.level).toBe(5);
    expect(store.raw('ce.save.profile')).toBeTruthy();
  });

  it('cleans junk values', () => {
    const p = sanitizeProfile({ settings: { music: 'yes', difficulty: 'insane' }, best: { level: -4, kills: NaN } });
    expect(p.settings).toEqual({ music: true, sfx: true, difficulty: 'normal', skin: null, hero: null, padMap: null });
    expect(sanitizeProfile({ settings: { skin: 'croc' } }).settings.skin).toBe('croc');
    expect(sanitizeProfile({ settings: { skin: '<script>' } }).settings.skin).toBeNull();
    expect(p.best.level).toBe(0);
    expect(p.best.kills).toBe(0);
  });
});

describe('two slots', () => {
  it('falls back to the backup when the main save is damaged', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint({ ...CP, level: 5 });
    sm.saveCheckpoint({ ...CP, level: 6 });
    // Damage the main slot (as if a write was cut off half way).
    store.setItem(RUN1, store.raw(RUN1)!.slice(0, 40));
    const got = sm.loadCheckpoint();
    expect(got.source).toBe('backup');
    expect(got.data?.level).toBe(5);
    expect(got.problem).toMatch(/earlier copy/);
  });

  it('detects edited data through the checksum', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    const env = JSON.parse(store.raw(RUN1)!);
    env.data.level = 99; // tampered, sum no longer matches
    store.setItem(RUN1, JSON.stringify(env));
    const got = sm.loadCheckpoint();
    expect(got.source).toBe('default');
    expect(got.data).toBeNull();
    expect(got.problem).toBeTruthy();
  });

  it('never overwrites a good backup with a damaged main save', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint({ ...CP, level: 4 });
    sm.saveCheckpoint({ ...CP, level: 5 }); // backup = 4, main = 5
    store.setItem(RUN1, '{broken');
    sm.saveCheckpoint({ ...CP, level: 6 }); // main damaged: backup must stay 4... or be the damaged one? stays 4
    const bak = JSON.parse(store.raw(RUN1 + '.bak')!);
    expect(bak.data.level).toBe(4);
    expect(sm.loadCheckpoint().data?.level).toBe(6);
  });

  it('clearCheckpoint removes both slots', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.saveCheckpoint(CP);
    sm.clearCheckpoint();
    expect(store.raw(RUN1)).toBeUndefined();
    expect(store.raw(RUN1 + '.bak')).toBeUndefined();
    expect(sm.loadCheckpoint().data).toBeNull();
  });

  it('rejects saves from a newer game version', () => {
    const { store, sm } = fresh();
    sm.saveProfile(DEFAULT_PROFILE);
    const env = JSON.parse(store.raw('ce.save.profile')!);
    env.v = 99;
    store.setItem('ce.save.profile', JSON.stringify(env));
    expect(sm.loadProfile().source).toBe('default');
  });
});

describe('checkpoint checks', () => {
  it('clamps out-of-range numbers', () => {
    const c = sanitizeCheckpoint({ ...CP, level: 500, hpRatio: 7, x: -50, stamina: 1e6, stats: { maxLevel: 2 } }, LIM)!;
    expect(c.level).toBe(99);
    expect(c.hpRatio).toBe(1);
    expect(c.x).toBe(0);
    expect(c.stamina).toBe(100);
    expect(c.stats.maxLevel).toBe(99);
  });
  it('keeps the Checkpoint Crab level, never above the run level (older saves have none)', () => {
    expect(sanitizeCheckpoint({ ...CP, level: 14, crabLevel: 10 }, LIM)!.crabLevel).toBe(10);
    expect(sanitizeCheckpoint({ ...CP, level: 14, crabLevel: 40 }, LIM)!.crabLevel).toBe(14);
    expect(sanitizeCheckpoint({ ...CP, level: 14 }, LIM)!.crabLevel).toBe(0);
    expect(sanitizeCheckpoint({ ...CP, level: 14, crabLevel: 'x' }, LIM)!.crabLevel).toBe(0);
  });
  it('refuses an unknown species or a missing level', () => {
    expect(sanitizeCheckpoint({ ...CP, species: 'dragon' }, LIM)).toBeNull();
    expect(sanitizeCheckpoint({ ...CP, level: 'seven' }, LIM)).toBeNull();
  });
  it('keeps valid perks, drops junk, and treats old saves as having none', () => {
    expect(sanitizeCheckpoint({ ...CP, perks: ['swift', 'jaws', 7, '<x>'] }, LIM)!.perks).toEqual(['swift', 'jaws']);
    expect(sanitizeCheckpoint({ ...CP }, LIM)!.perks).toEqual([]);
  });
  it('never resumes with zero health', () => {
    expect(sanitizeCheckpoint({ ...CP, hpRatio: 0 }, LIM)!.hpRatio).toBeGreaterThan(0);
  });
});

describe('storage failures', () => {
  it('keeps working when storage is blocked', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    const sm = new SaveManager(blocked, LIM);
    expect(sm.persistent).toBe(false);
    expect(sm.saveCheckpoint(CP)).toBe(false);
    expect(sm.failedWrites).toBe(1);
    expect(sm.loadProfile().data).toEqual(DEFAULT_PROFILE);
  });
});

describe('helpers', () => {
  it('checksum is stable and sensitive', () => {
    expect(checksum('abc')).toBe(checksum('abc'));
    expect(checksum('abc')).not.toBe(checksum('abd'));
  });
  it('migrate is a no-op at the current version and fails on unknown old ones', () => {
    expect(migrate(1, { a: 1 })).toEqual({ v: 1, data: { a: 1 } });
    expect(() => migrate(0, {})).toThrow();
  });
  it('mergeBest takes the better record', () => {
    expect(mergeBest({ level: 5, kills: 1, fish: 1 }, { level: 6, kills: 0, fish: 0 }).level).toBe(6);
    expect(mergeBest({ level: 5, kills: 3, fish: 1 }, { level: 5, kills: 2, fish: 9 }).kills).toBe(3);
  });
  it('a full save stays small (under 5 KB)', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.saveProfile(DEFAULT_PROFILE);
    const size = (store.raw(RUN1)!.length + store.raw('ce.save.profile')!.length) * 2;
    expect(size).toBeLessThan(5000);
  });
});

describe('save slots (per player and per creature)', () => {
  it('each slot keeps its own run, with its own backup', () => {
    const { sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.setSlot(2);
    expect(sm.loadCheckpoint().data).toBeNull();
    sm.saveCheckpoint({ ...CP, level: 22 });
    sm.saveCheckpoint({ ...CP, level: 23 });
    expect(sm.loadCheckpoint().data?.level).toBe(23);
    expect(sm.loadCheckpoint(1).data?.level).toBe(7);
    expect(sm.loadCheckpoint(5).data).toBeNull();
  });
  it('every creature has its own five slots', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.setHero('mosa');
    expect(sm.loadCheckpoint().data).toBeNull();
    sm.saveCheckpoint({ ...CP, species: 'mosa', level: 12 });
    expect(store.getItem('ce.save.run.p1.mosa.1')).not.toBeNull();
    expect(sm.loadCheckpoint(1, 'crocodile').data?.level).toBe(7);
    expect(sm.loadCheckpoint().data?.level).toBe(12);
    sm.setHero('blue_tang'); // not a hero: ignored
    expect(sm.activeHero).toBe('mosa');
  });
  it('a damaged slot falls back to its own backup, never to another slot', () => {
    const { store, sm } = fresh();
    sm.setSlot(2);
    sm.saveCheckpoint({ ...CP, level: 10 });
    sm.saveCheckpoint({ ...CP, level: 11 });
    store.setItem('ce.save.run.p1.crocodile.2', '{broken');
    const got = sm.loadCheckpoint();
    expect(got.source).toBe('backup');
    expect(got.data?.level).toBe(10);
  });
  it('deleting a slot leaves the others alone', () => {
    const { sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.setSlot(3);
    sm.saveCheckpoint({ ...CP, level: 30 });
    sm.clearCheckpoint(3);
    expect(sm.loadCheckpoint(3).data).toBeNull();
    expect(sm.loadCheckpoint(1).data?.level).toBe(7);
  });
  it('slot numbers stay in range', () => {
    const { sm } = fresh();
    sm.setSlot(9);
    expect(sm.activeSlot).toBe(5);
    sm.setSlot(-2);
    expect(sm.activeSlot).toBe(1);
  });
  it('slot names: per creature, renameable, cleaned, defaults for missing or empty names', () => {
    expect(DEFAULT_PROFILE.slots).toEqual({});
    const p = sanitizeProfile({ slots: { mosa: { active: 2, names: ['  Mike\u0007s reef  ', '', 42, 'x'.repeat(60)] } } });
    expect(p.slots.mosa.active).toBe(2);
    expect(p.slots.mosa.names).toEqual(['Mikes reef', 'Game 2', 'Game 3', 'x'.repeat(24), 'Game 5']);
    expect(sanitizeProfile({ slots: { fang: { names: ['<b>Dad</b>'] } } }).slots.fang.names[0]).toBe('bDad/b');
    expect(sanitizeProfile({ slots: { fang: { active: 7 } } }).slots.fang.active).toBe(5);
    expect(sanitizeProfile({ slots: { 'bad key!': { active: 2 } } }).slots).toEqual({});
  });
  it('reset removes every slot of every player', () => {
    const { store, sm } = fresh();
    sm.loadPlayers();
    const p2 = sm.addPlayer('Mike')!;
    for (const pl of [1, p2])
      for (const n of [1, 2, 5]) {
        sm.setPlayer(pl);
        sm.setSlot(n);
        sm.saveCheckpoint({ ...CP, level: n * 5 });
      }
    sm.resetAll();
    for (const pl of [1, p2]) for (const n of [1, 2, 5]) expect(store.getItem(SaveManager.slotKey(n, 'crocodile', pl))).toBeNull();
    expect(store.getItem('ce.save.players')).toBeNull();
  });
});

describe('players', () => {
  it('a new device has one player, Player 1', () => {
    const { sm } = fresh();
    expect(sm.loadPlayers()).toEqual({ active: 1, players: [{ id: 1, name: 'Player 1' }] });
  });
  it('each player has their own profile and runs', () => {
    const { store, sm } = fresh();
    sm.loadPlayers();
    const prof = structuredClone(DEFAULT_PROFILE);
    prof.settings.music = false;
    prof.best.level = 30;
    sm.saveProfile(prof);
    sm.saveCheckpoint(CP);
    const mike = sm.addPlayer('  Mike  ', prof)!;
    expect(mike).toBe(2);
    sm.setPlayer(mike);
    const p2 = sm.loadProfile().data;
    expect(p2.best.level).toBe(0); // their own record
    expect(p2.settings.music).toBe(false); // sound settings copied from the player who added them
    expect(sm.loadCheckpoint().data).toBeNull();
    sm.saveCheckpoint({ ...CP, level: 3 });
    expect(store.getItem('ce.save.run.p2.crocodile.1')).not.toBeNull();
    sm.setPlayer(1);
    expect(sm.loadCheckpoint().data?.level).toBe(7);
    expect(sm.loadPlayers().players.map((p) => p.name)).toEqual(['Player 1', 'Mike']);
  });
  it('up to four players; rename; delete removes their games; the last one stays', () => {
    const { store, sm } = fresh();
    sm.loadPlayers();
    expect(sm.addPlayer('B')).toBe(2);
    expect(sm.addPlayer('C')).toBe(3);
    expect(sm.addPlayer('D')).toBe(4);
    expect(sm.addPlayer('E')).toBeNull();
    sm.renamePlayer(3, '<Carla>');
    expect(sm.loadPlayers().players.find((p) => p.id === 3)!.name).toBe('Carla');
    sm.setPlayer(3);
    sm.saveCheckpoint(CP);
    expect(sm.deletePlayer(3)).toBe(true);
    expect(store.getItem('ce.save.run.p3.crocodile.1')).toBeNull();
    expect(store.getItem('ce.save.profile.p3')).toBeNull();
    for (const id of [1, 2, 4]) sm.deletePlayer(id);
    expect(sm.loadPlayers().players.length).toBe(1);
  });
  it('saves from before players move to player 1, each into a slot of its own creature', () => {
    // An old device: one profile with 3 shared slots (slot 2 in use) and runs as croc, mosa and croc.
    const store = new MemoryStore();
    const env = (kind: string, data: unknown) => JSON.stringify({ v: 1, kind, savedAt: 5, app: '0.46.0', device: 'd', sum: checksum(JSON.stringify(data)), data });
    const old = { ...DEFAULT_PROFILE, slots: { active: 2, names: ["Dad's croc", "Mike's mosa", 'Game 3'] } };
    store.setItem('ce.save.profile', env('profile', old));
    store.setItem('ce.save.checkpoint', env('checkpoint', { ...CP, level: 9 }));
    store.setItem('ce.save.checkpoint.2', env('checkpoint', { ...CP, species: 'mosa', level: 14 }));
    store.setItem('ce.save.checkpoint.3', env('checkpoint', { ...CP, level: 21 }));
    const sm = new SaveManager(store, LIM);
    expect(sm.loadPlayers().players).toEqual([{ id: 1, name: 'Player 1' }]);
    const prof = sm.loadProfile().data;
    expect(prof.slots.crocodile.names.slice(0, 2)).toEqual(["Dad's croc", 'Game 2']);
    expect(prof.slots.mosa).toEqual({ active: 1, names: ["Mike's mosa", 'Game 2', 'Game 3', 'Game 4', 'Game 5'] });
    expect(prof.settings.hero).toBe('mosa'); // the game in use stays picked
    expect(sm.loadCheckpoint(1, 'crocodile').data?.level).toBe(9);
    expect(sm.loadCheckpoint(2, 'crocodile').data?.level).toBe(21);
    expect(sm.loadCheckpoint(1, 'mosa').data?.level).toBe(14);
    expect(store.getItem('ce.save.checkpoint')).toBeNull();
    expect(store.getItem('ce.save.checkpoint.2')).toBeNull();
    // It happens once: a second load changes nothing.
    expect(new SaveManager(store, LIM).loadPlayers().players.length).toBe(1);
    expect(sm.loadCheckpoint(1, 'mosa').data?.level).toBe(14);
  });
  it('a player list that makes no sense is repaired', () => {
    expect(sanitizePlayers({ active: 9, players: [{ id: 2, name: '' }, { id: 2, name: 'dup' }, { id: 77 }] })).toEqual({ active: 2, players: [{ id: 2, name: 'Player 2' }] });
    expect(sanitizePlayers(null)).toEqual({ active: 1, players: [{ id: 1, name: 'Player 1' }] });
  });
});

describe('world width and bosses in the save (Nov 23)', () => {
  it('keeps the world width and the beaten bosses', () => {
    const c = sanitizeCheckpoint({ ...CP, worldW: 114000, bossesBeaten: ['electric_eel', 'BAD id!'] }, LIM)!;
    expect(c.worldW).toBe(114000);
    expect(c.bossesBeaten).toEqual(['electric_eel']);
  });
  it('saves written after the 7-region sea went live are not moved again', async () => {
    const { SEVEN_REGIONS_SINCE } = await import('../src/save/SaveManager');
    const store = new MemoryStore();
    const before = new SaveManager(store, LIM, '0.41.0', () => SEVEN_REGIONS_SINCE - 1000);
    before.saveCheckpoint(CP);
    expect(before.loadCheckpoint().data!.worldW).toBeUndefined();
    const after = new SaveManager(new MemoryStore(), LIM, '0.43.0', () => SEVEN_REGIONS_SINCE + 1000);
    after.saveCheckpoint(CP);
    expect(after.loadCheckpoint().data!.worldW).toBe(114000);
  });
});
