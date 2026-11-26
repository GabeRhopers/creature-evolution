// The first minutes (MVP step 2): a coach that teaches by doing. One short line at a time, near the top of the screen,
// that moves on as soon as the player has done it: swim, eat plankton, swallow a fish (green ring), bite a big one
// (orange ring), level up. After that, two tips appear once, only when they matter: a full stomach, and being hunted.
// Each player sees the steps once (settings.coachDone); "Show tips again" in Options brings them back.
// Pure: GameScene facts in, the line to show out (tests/coach.test.ts).

export interface CoachFacts {
  /** Pixels swum this run. */
  moved: number;
  plankton: number;
  fish: number;
  /** The player's bites this run. */
  bites: number;
  level: number;
  /** Stomach fullness 0..1. */
  stomach: number;
  hunted: boolean;
  /** Playing on a touch screen (else keyboard and mouse, or a controller). */
  touch: boolean;
  pad: boolean;
}

export interface CoachStep {
  id: string;
  text: (f: CoachFacts) => string;
  done: (f: CoachFacts) => boolean;
}

const eat = (f: CoachFacts) => (f.pad ? 'press A' : f.touch ? 'tap EAT' : 'press Space');
export const COACH_STEPS: CoachStep[] = [
  { id: 'swim', text: (f) => (f.pad ? 'Swim with the left stick' : f.touch ? 'Use the joystick on the left to swim' : 'Swim with the arrow keys or WASD'), done: (f) => f.moved >= 400 },
  { id: 'plankton', text: () => 'Swim through the glowing dots to eat plankton', done: (f) => f.plankton >= 5 },
  { id: 'swallow', text: (f) => `A GREEN ring means you can swallow it: swim close and ${eat(f)}`, done: (f) => f.fish >= 1 },
  { id: 'bite', text: (f) => `An ORANGE ring means too big to swallow: ${eat(f)} to bite it`, done: (f) => f.bites >= 1 },
  { id: 'grow', text: () => 'Keep eating to fill the star bar and level up', done: (f) => f.level >= 2 },
];
/** Shown for a moment when the steps are done. */
export const COACH_DONE_TEXT = 'Nice! Keep growing. At level 10 the Checkpoint Crab waits';

export interface CoachTip {
  id: string;
  text: string;
  when: (f: CoachFacts) => boolean;
}
export const COACH_TIPS: CoachTip[] = [
  { id: 'stomach', text: 'Your stomach is full: slow down and rest to digest', when: (f) => f.stomach >= 0.9 },
  { id: 'hunted', text: 'Something is hunting you! Swim away or hide in kelp', when: (f) => f.hunted },
];

export interface CoachState {
  /** Index of the current step (COACH_STEPS.length = all done). */
  step: number;
  /** Seconds left on the "done" line. */
  doneFor: number;
  tipsSeen: string[];
  /** The tip showing now and its seconds left. */
  tip: { id: string; left: number } | null;
}
export const TIP_SECONDS = 5;
export const DONE_SECONDS = 4;

export function newCoach(coachDone: boolean, tipsSeen: string[] = []): CoachState {
  return { step: coachDone ? COACH_STEPS.length : 0, doneFor: 0, tipsSeen: [...tipsSeen], tip: null };
}

/**
 * Advance the coach by `dt` seconds. Returns the line to show ('' = nothing) and what changed for saving.
 * Steps go in order but can complete together (eating a fish early skips ahead); tips wait for the steps.
 */
export function stepCoach(s: CoachState, f: CoachFacts, dt: number): { text: string; finished: boolean; tipSeen: string | null } {
  let finished = false;
  let tipSeen: string | null = null;
  if (s.step < COACH_STEPS.length) {
    while (s.step < COACH_STEPS.length && COACH_STEPS[s.step].done(f)) s.step++;
    if (s.step === COACH_STEPS.length) {
      finished = true;
      s.doneFor = DONE_SECONDS;
    } else return { text: COACH_STEPS[s.step].text(f), finished, tipSeen };
  }
  if (s.doneFor > 0) {
    s.doneFor -= dt;
    return { text: COACH_DONE_TEXT, finished, tipSeen };
  }
  if (s.tip) {
    s.tip.left -= dt;
    if (s.tip.left > 0) return { text: COACH_TIPS.find((t) => t.id === s.tip!.id)!.text, finished, tipSeen };
    s.tip = null;
  }
  const next = COACH_TIPS.find((t) => !s.tipsSeen.includes(t.id) && t.when(f));
  if (next) {
    s.tipsSeen.push(next.id);
    s.tip = { id: next.id, left: TIP_SECONDS };
    tipSeen = next.id;
    return { text: next.text, finished, tipSeen };
  }
  return { text: '', finished, tipSeen };
}
