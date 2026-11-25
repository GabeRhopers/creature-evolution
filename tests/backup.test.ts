import { describe, expect, it } from 'vitest';
import { backupFileName, backupKey, buildBackup, parseBackup } from '../src/save/backup';

describe('backup file', () => {
  const entries: Array<[string, string]> = [
    ['ce.save.profile', '{"v":1}'], ['ce.save.run.p1.fang.2', '{"v":1}'], ['ce.save.run.p1.fang.2.bak', '{"v":1}'],
    ['spritestudio:sk-abc-adult', '{"name":"Blue"}'], ['spritestudio.device', 'x1'], ['ce.errors', '[]'], ['other.app', 'no'],
  ];
  it('keeps the game and studio keys only (not the problem log or other sites)', () => {
    const b = buildBackup(entries, '0.56.0', new Date('2026-11-25T12:00:00Z'));
    expect(Object.keys(b.keys).sort()).toEqual(['ce.save.profile', 'ce.save.run.p1.fang.2', 'ce.save.run.p1.fang.2.bak', 'spritestudio.device', 'spritestudio:sk-abc-adult']);
    expect(backupKey('ce.errors')).toBe(false);
  });
  it('reads its own file back', () => {
    const b = buildBackup(entries, '0.56.0');
    const got = parseBackup(JSON.stringify(b));
    expect('keys' in got && got.count).toBe(5);
  });
  it('refuses other files with a clear message', () => {
    expect(parseBackup('not json')).toEqual({ problem: expect.stringMatching(/not a Creature Evolution backup/) });
    expect(parseBackup('{"app":"other","keys":{}}')).toHaveProperty('problem');
    expect(parseBackup('{"app":"creature-evolution","keys":{"evil.key":"x"}}')).toEqual({ problem: 'That backup is empty.' });
  });
  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-11-25T12:00:00Z'))).toBe('creature-evolution-backup-2026-11-25.json');
  });
});
