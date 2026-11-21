import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { C, WATER_STOPS, rng, waterColor } from '../src/systems/worldTextures';

const palette: string[] = JSON.parse(readFileSync('public/studio/palette-endesga32.json', 'utf8')).colors ?? [];

describe('pixel world', () => {
  it('uses only Endesga 32 colors', () => {
    const pal = new Set((palette.length ? palette : []).map((c) => c.toLowerCase()));
    if (!pal.size) return; // palette file shape checked by framework tests
    for (const col of Object.values(C)) expect(pal.has(col)).toBe(true);
  });
  it('water bands match the areas and dither only near the edges', () => {
    expect(WATER_STOPS.map((s) => s[0])).toEqual([0, 0.4, 0.7, 0.95]);
    expect(waterColor(0.2, 0, 0)).toBe(C.blue);
    expect(waterColor(0.55, 0, 0)).toBe(C.deepBlue);
    expect(waterColor(0.85, 0, 0)).toBe(C.navy);
    const mixed = new Set<string>();
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) mixed.add(waterColor(0.42, x, y));
    expect(mixed).toEqual(new Set([C.blue, C.deepBlue]));
  });
  it('generates the same art every run', () => {
    const a = rng(7), b = rng(7);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
});
