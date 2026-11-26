import { describe, expect, it } from 'vitest';
import { playReport, summarize, type RunRecord } from '../src/ui/playLog';

const run = (o: Partial<RunRecord>): RunRecord => ({ at: '2026-11-26T10:00:00Z', app: '0.59.0', player: 'Mike', hero: 'crocodile', seconds: 120, level: 4, startLevel: 1, end: 'died', cause: 'bitten', region: 'Coral Sea', kills: 1, fish: 3, coachDone: true, ...o });

describe('playtest log', () => {
  const runs = [
    run({ seconds: 40, level: 2, cause: 'swallowed' }),
    run({ seconds: 300, level: 11, end: 'home', cause: undefined, region: undefined }),
    run({ seconds: 200, level: 7, at: '2026-11-27T09:00:00Z', player: 'Leo', hero: 'spino' }),
    run({ seconds: 90, level: 3, end: 'closed', cause: undefined }),
  ];
  it('answers the playtest questions', () => {
    const s = summarize(runs);
    expect(s.runs).toBe(4);
    expect(s.minutes).toBe(11);
    expect(s.medianSeconds).toBe(200);
    expect(s.quickRuns).toBe(1);
    expect(s.bestLevel).toBe(11);
    expect(s.reachedCrab).toBe(1);
    expect(s.ends).toEqual({ died: 2, home: 1, closed: 1 });
    expect(s.causes).toEqual({ swallowed: 1, bitten: 1 });
    expect(s.deathRegions).toEqual({ 'Coral Sea': 2 });
    expect(s.players).toEqual(['Mike', 'Leo']);
    expect(s.days).toBe(2);
  });
  it('writes a readable report, newest run first', () => {
    const t = playReport(runs, 'iPad');
    expect(t).toMatch(/Runs: 4 over 2 day\(s\), 11 min in total; a typical run lasts 3:20; 1 lasted under a minute/);
    expect(t).toMatch(/Deaths by cause: (swallowed 1, bitten 1|bitten 1, swallowed 1)/);
    expect(t.split('\n').find((l) => l.startsWith('2026'))).toMatch(/Mike crocodile lv 1->3 1:30 closed/);
  });
  it('an empty log is fine', () => {
    expect(summarize([]).medianSeconds).toBe(0);
    expect(playReport([], 'iPad')).toMatch(/Runs: 0/);
  });
});
