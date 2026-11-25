// One backup file with everything this device keeps: players, profiles, save slots (with their checksums and
// .bak copies), enemy settings, and every Sprite Studio drawing and skin. Offline the device is the only copy, so
// this is how saves move to a new tablet, survive clearing the browser, or travel into the Android app.
// Pure helpers (unit tested in tests/backup.test.ts); the menu does the file picking.

export const BACKUP_APP = 'creature-evolution';
/** Keys the game and the studio own. The problem log stays on its device. */
export const backupKey = (k: string): boolean =>
  (k.startsWith('ce.') && k !== 'ce.errors') || k.startsWith('spritestudio:') || k.startsWith('spritestudio.');

export interface Backup {
  app: string;
  version: string;
  exportedAt: string;
  keys: Record<string, string>;
}

export function buildBackup(entries: Iterable<[string, string]>, version: string, now = new Date()): Backup {
  const keys: Record<string, string> = {};
  for (const [k, v] of entries) if (backupKey(k) && typeof v === 'string') keys[k] = v;
  return { app: BACKUP_APP, version, exportedAt: now.toISOString(), keys };
}

/** Read a backup file. Returns its keys, or a plain-language problem. */
export function parseBackup(text: string): { keys: Record<string, string>; exportedAt: string; count: number } | { problem: string } {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return { problem: 'That file is not a Creature Evolution backup.' };
  }
  const b = d as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || !b.keys || typeof b.keys !== 'object') return { problem: 'That file is not a Creature Evolution backup.' };
  const keys: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.keys)) if (backupKey(k) && typeof v === 'string' && v.length < 2_000_000) keys[k] = v;
  if (!Object.keys(keys).length) return { problem: 'That backup is empty.' };
  return { keys, exportedAt: String(b.exportedAt ?? ''), count: Object.keys(keys).length };
}

/** The backup's file name, like creature-evolution-backup-2026-11-25.json. */
export const backupFileName = (now = new Date()) => `creature-evolution-backup-${now.toISOString().slice(0, 10)}.json`;
