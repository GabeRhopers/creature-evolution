import { describe, expect, it } from 'vitest';
import croc from '../tools/sprite-studio/croc-project.json';
import { decodeFrame, poseMap, validateProject, type StudioProject } from '../src/skins';

const P = croc as unknown as StudioProject;

describe('studio to game', () => {
  it('the crocodile project is valid', () => {
    expect(validateProject(P)).toEqual([]);
  });
  it('maps poses to animations and skips empty frames', () => {
    const m = poseMap(P);
    expect(m.idle.length).toBe(4);
    expect(m.swim.length).toBe(2);
    expect(m.bite).toEqual(['attack', 0]);
    expect(m.rest).toEqual(['rest', 0]);
    expect(m.damage).toBeUndefined(); // not drawn yet
    expect(m.celebrate).toEqual([]);
  });
  it('swimming falls back to idle when move is empty', () => {
    const p = structuredClone(P);
    p.poses.find((x) => x.name === 'move')!.frames = [];
    expect(poseMap(p).swim.length).toBe(4);
  });
  it('an empty drawing is refused with a clear message', () => {
    const p = structuredClone(P);
    p.poses.forEach((x) => (x.frames = x.frames.map((f) => f.replace(/./g, '.'))));
    expect(validateProject(p)[0]).toMatch(/idle or move/);
  });
  it('refuses junk', () => {
    expect(validateProject(null).length).toBeGreaterThan(0);
    expect(validateProject({ w: 500, h: 2, palette: ['red'], poses: [] }).length).toBeGreaterThan(1);
  });
  it('decodes pixels', () => {
    expect(Array.from(decodeFrame('.0A', 4))).toEqual([-1, 0, 10, -1]);
  });
});
