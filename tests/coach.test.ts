import { describe, expect, it } from 'vitest';
import { COACH_DONE_TEXT, COACH_STEPS, newCoach, stepCoach, type CoachFacts } from '../src/systems/coach';

const F = (o: Partial<CoachFacts> = {}): CoachFacts => ({ moved: 0, plankton: 0, fish: 0, bites: 0, level: 1, stomach: 0, hunted: false, touch: true, pad: false, ...o });

describe('first minutes coach', () => {
  it('teaches one thing at a time, in order, for touch screens', () => {
    const s = newCoach(false);
    expect(stepCoach(s, F(), 0.25).text).toBe('Use the joystick on the left to swim');
    expect(stepCoach(s, F({ moved: 500 }), 0.25).text).toMatch(/glowing dots/);
    expect(stepCoach(s, F({ moved: 500, plankton: 5 }), 0.25).text).toMatch(/GREEN ring.*tap EAT/);
    expect(stepCoach(s, F({ moved: 500, plankton: 5, fish: 1 }), 0.25).text).toMatch(/ORANGE ring.*hold EAT.*let go/);
    expect(stepCoach(s, F({ moved: 500, plankton: 5, fish: 1, bites: 1 }), 0.25).text).toMatch(/level up/);
    const end = stepCoach(s, F({ moved: 500, plankton: 5, fish: 1, bites: 1, level: 2 }), 0.25);
    expect(end).toEqual({ text: COACH_DONE_TEXT, finished: true, tipSeen: null });
  });
  it('speaks the player\'s controls', () => {
    expect(stepCoach(newCoach(false), F({ touch: false }), 0).text).toMatch(/arrow keys/);
    expect(stepCoach(newCoach(false), F({ pad: true }), 0).text).toMatch(/left stick/);
    const s = newCoach(false);
    expect(stepCoach(s, F({ moved: 999, plankton: 9, touch: false }), 0).text).toMatch(/press Space/);
  });
  it('skips steps the player already did', () => {
    const s = newCoach(false);
    expect(stepCoach(s, F({ moved: 999, plankton: 9, fish: 2 }), 0.25).text).toMatch(/ORANGE/);
  });
  it('the done line shows for a few seconds, then nothing', () => {
    const s = newCoach(false);
    const all = F({ moved: 999, plankton: 9, fish: 2, bites: 3, level: 3 });
    expect(stepCoach(s, all, 0.25).finished).toBe(true);
    for (let i = 0; i < 20; i++) stepCoach(s, all, 0.25);
    expect(stepCoach(s, all, 0.25).text).toBe('');
  });
  it('players who finished see no steps, only each tip once, when it matters', () => {
    const s = newCoach(true);
    expect(stepCoach(s, F(), 0.25).text).toBe('');
    const r = stepCoach(s, F({ stomach: 0.95 }), 0.25);
    expect(r.text).toMatch(/stomach is full/);
    expect(r.tipSeen).toBe('stomach');
    for (let i = 0; i < 30; i++) stepCoach(s, F({ stomach: 0.95 }), 0.25);
    expect(stepCoach(s, F({ stomach: 0.95 }), 0.25).text).toBe('');
    expect(stepCoach(s, F({ hunted: true }), 0.25).text).toMatch(/hunting you/);
  });
  it('tips wait until the steps are done', () => {
    const s = newCoach(false, []);
    expect(stepCoach(s, F({ hunted: true }), 0.25).text).toBe(COACH_STEPS[0].text(F()));
  });
});
