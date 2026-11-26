// Playtest log (MVP step 3): every run on this device, kept privately in localStorage (`ce.playlog`, last 60 runs) and
// carried in the backup file. Nothing is sent anywhere. Options > Playtest log shows a summary that answers the playtest
// questions (how long do runs last, where and how do players die, do they get through the first minutes, do they come
// back), and "Copy report" gives a plain-text version to paste into a chat. The summary is pure (tests/playlog.test.ts).

export type RunEnd = 'died' | 'home' | 'closed';
export interface RunRecord {
  at: string;
  app: string;
  player: string;
  hero: string;
  /** Seconds of play in this run (or since Continue). */
  seconds: number;
  level: number;
  startLevel: number;
  end: RunEnd;
  cause?: string;
  region?: string;
  kills: number;
  fish: number;
  /** The coach was finished by the end of this run. */
  coachDone: boolean;
}

const KEY = 'ce.playlog';
const MAX = 60;
export function readPlayLog(): RunRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function addRun(r: RunRecord): void {
  const list = readPlayLog();
  list.push(r);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage full: the log is only a helper */
  }
}
export function clearPlayLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export interface PlaySummary {
  runs: number;
  minutes: number;
  /** Median run length in seconds. */
  medianSeconds: number;
  /** Runs shorter than a minute (a sign of confusion or an early death). */
  quickRuns: number;
  bestLevel: number;
  reachedCrab: number;
  ends: Record<RunEnd, number>;
  causes: Record<string, number>;
  deathRegions: Record<string, number>;
  heroes: Record<string, number>;
  players: string[];
  /** Days with at least one run (do they come back?). */
  days: number;
  coachFinished: boolean;
}

const count = (list: string[]) => list.reduce<Record<string, number>>((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {});

export function summarize(runs: RunRecord[]): PlaySummary {
  const secs = runs.map((r) => r.seconds).sort((a, b) => a - b);
  const died = runs.filter((r) => r.end === 'died');
  return {
    runs: runs.length,
    minutes: Math.round(secs.reduce((a, b) => a + b, 0) / 60),
    medianSeconds: secs.length ? Math.round(secs[secs.length >> 1]) : 0,
    quickRuns: runs.filter((r) => r.seconds < 60).length,
    bestLevel: runs.reduce((m, r) => Math.max(m, r.level), 0),
    reachedCrab: runs.filter((r) => r.level >= 10).length,
    ends: { died: died.length, home: runs.filter((r) => r.end === 'home').length, closed: runs.filter((r) => r.end === 'closed').length },
    causes: count(died.map((r) => r.cause ?? 'unknown')),
    deathRegions: count(died.map((r) => r.region ?? 'unknown')),
    heroes: count(runs.map((r) => r.hero)),
    players: [...new Set(runs.map((r) => r.player))],
    days: new Set(runs.map((r) => r.at.slice(0, 10))).size,
    coachFinished: runs.some((r) => r.coachDone),
  };
}

const top = (m: Record<string, number>) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(', ') || 'none';
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** A plain-text report to paste into a chat or a note. */
export function playReport(runs: RunRecord[], device: string): string {
  const s = summarize(runs);
  const lines = [
    `Creature Evolution playtest log (${device}, ${new Date().toISOString().slice(0, 10)})`,
    `Players: ${s.players.join(', ') || 'none'}`,
    `Runs: ${s.runs} over ${s.days} day(s), ${s.minutes} min in total; a typical run lasts ${clock(s.medianSeconds)}; ${s.quickRuns} lasted under a minute`,
    `Best level: ${s.bestLevel}; runs that reached level 10 (the first crab): ${s.reachedCrab}`,
    `How runs ended: died ${s.ends.died}, went home ${s.ends.home}, closed the game ${s.ends.closed}`,
    `Deaths by cause: ${top(s.causes)}`,
    `Deaths by region: ${top(s.deathRegions)}`,
    `Heroes played: ${top(s.heroes)}`,
    `First-minutes coach finished: ${s.coachFinished ? 'yes' : 'not yet'}`,
    '',
    'Runs (newest first):',
    ...runs
      .slice()
      .reverse()
      .slice(0, 30)
      .map((r) => `${r.at.slice(0, 16).replace('T', ' ')} ${r.player} ${r.hero} lv ${r.startLevel}->${r.level} ${clock(r.seconds)} ${r.end}${r.cause ? ` (${r.cause}${r.region ? `, ${r.region}` : ''})` : ''}`),
  ];
  return lines.join('\n');
}
