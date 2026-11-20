// The game's one SaveManager, wired to the browser's storage.
import { BALANCE, SPECIES } from '../data';
import { MemoryStore, SaveManager, type KeyValueStore } from './SaveManager';

export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev';

function pickStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    ls.setItem('ce.probe', '1');
    ls.removeItem('ce.probe');
    return ls;
  } catch {
    return new MemoryStore(); // storage blocked: the game still works, saves last until the tab closes
  }
}

export const saves = new SaveManager(
  pickStore(),
  {
    species: Object.keys(SPECIES),
    maxLevel: 99,
    worldWidth: BALANCE.world.width,
    worldHeight: BALANCE.world.height,
    maxStamina: BALANCE.stamina.max,
  },
  APP_VERSION,
);

export * from './SaveManager';
