import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { PERK_ICONS, PERK_ICON_COLORS } from '../src/ui/perkIcons';
import { BALANCE } from '../src/data';

const E32: string[] = JSON.parse(readFileSync('public/studio/palette-endesga32.json', 'utf8')).colors;

describe('perk icons', () => {
  it('every perk has a 16x16 pixel icon', () => {
    for (const p of BALANCE.perks.list as Array<{ id: string }>) {
      const g = PERK_ICONS[p.id];
      expect(g, p.id).toBeDefined();
      expect(g.length, p.id).toBe(16);
      for (const row of g) expect(row.length, `${p.id}: ${row}`).toBe(16);
    }
  });
  it('icons use only Endesga 32 colors', () => {
    for (const [id, g] of Object.entries(PERK_ICONS))
      for (const ch of g.join('')) {
        if (ch === '.') continue;
        expect(PERK_ICON_COLORS[ch], `${id} uses unknown color '${ch}'`).toBeDefined();
        expect(E32).toContain(PERK_ICON_COLORS[ch]);
      }
  });
});
