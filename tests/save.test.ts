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
  type Checkpoint,
  type SaveLimits,
} from '../src/save/SaveManager';

const LIM: SaveLimits = { species: ['crocodile', 'blue_tang'], maxLevel: 99, worldWidth: 6000, worldHeight: 3000, maxStamina: 100 };

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
    expect(p.data.settings).toEqual({ music: false, sfx: true, difficulty: 'hard', skin: null });
    expect(p.data.best.level).toBe(5);
    expect(store.raw('ce.save.profile')).toBeTruthy();
  });

  it('cleans junk values', () => {
    const p = sanitizeProfile({ settings: { music: 'yes', difficulty: 'insane' }, best: { level: -4, kills: NaN } });
    expect(p.settings).toEqual({ music: true, sfx: true, difficulty: 'normal', skin: null });
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
    store.setItem('ce.save.checkpoint', store.raw('ce.save.checkpoint')!.slice(0, 40));
    const got = sm.loadCheckpoint();
    expect(got.source).toBe('backup');
    expect(got.data?.level).toBe(5);
    expect(got.problem).toMatch(/earlier copy/);
  });

  it('detects edited data through the checksum', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    const env = JSON.parse(store.raw('ce.save.checkpoint')!);
    env.data.level = 99; // tampered, sum no longer matches
    store.setItem('ce.save.checkpoint', JSON.stringify(env));
    const got = sm.loadCheckpoint();
    expect(got.source).toBe('default');
    expect(got.data).toBeNull();
    expect(got.problem).toBeTruthy();
  });

  it('never overwrites a good backup with a damaged main save', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint({ ...CP, level: 4 });
    sm.saveCheckpoint({ ...CP, level: 5 }); // backup = 4, main = 5
    store.setItem('ce.save.checkpoint', '{broken');
    sm.saveCheckpoint({ ...CP, level: 6 }); // main damaged: backup must stay 4... or be the damaged one? stays 4
    const bak = JSON.parse(store.raw('ce.save.checkpoint.bak')!);
    expect(bak.data.level).toBe(4);
    expect(sm.loadCheckpoint().data?.level).toBe(6);
  });

  it('clearCheckpoint removes both slots', () => {
    const { store, sm } = fresh();
    sm.saveCheckpoint(CP);
    sm.saveCheckpoint(CP);
    sm.clearCheckpoint();
    expect(store.raw('ce.save.checkpoint')).toBeUndefined();
    expect(store.raw('ce.save.checkpoint.bak')).toBeUndefined();
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
    const size = (store.raw('ce.save.checkpoint')!.length + store.raw('ce.save.profile')!.length) * 2;
    expect(size).toBeLessThan(5000);
  });
});
