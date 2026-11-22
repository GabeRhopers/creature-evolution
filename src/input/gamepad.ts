// External controllers (Xbox, PlayStation, Switch Pro, most Bluetooth pads) through the
// browser's Gamepad API, which iPad Safari supports too.
//
// Buttons use the "standard" layout: 0 A (bottom) 1 B (right) 2 X (left) 3 Y (top)
// 4 LB 5 RB 6 LT 7 RT 8 Back/Select 9 Start 12-15 D-pad up/down/left/right.
// Every connected pad counts, so any of them can play.
//
// One shared poll per frame: the game, the HUD and the HTML menus all read the same
// state, so a press is seen by whoever is listening in that frame, and never twice.

export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** In-game actions a controller button can do. Menus always use the D-pad, A (choose) and B (back). */
export type PadAction = 'eat' | 'sprint' | 'ability' | 'pause';
export const PAD_ACTIONS: PadAction[] = ['eat', 'sprint', 'ability', 'pause'];
export const PAD_ACTION_NAMES: Record<PadAction, string> = { eat: 'Eat', sprint: 'Sprint', ability: 'Ability', pause: 'Pause' };
export type PadMap = Record<PadAction, number[]>;
export const DEFAULT_PAD_MAP: PadMap = {
  eat: [PAD.A],
  sprint: [PAD.B, PAD.LT, PAD.RT],
  ability: [PAD.X, PAD.Y, PAD.RB],
  pause: [PAD.START],
};
/** Buttons the player can map (the D-pad steers, so it is left out). */
export const MAPPABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 16];
/** Controller families, guessed from the browser's controller name. Buttons sit in the same places. */
export type PadStyle = 'xbox' | 'playstation' | 'switch';
export function padStyle(name: string): PadStyle {
  if (/playstation|dualsense|dualshock|054c/i.test(name)) return 'playstation';
  if (/nintendo|pro controller|joy-con|057e/i.test(name)) return 'switch';
  return 'xbox';
}
const NAMES: Record<PadStyle, Record<number, string>> = {
  xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT', 8: 'View', 9: 'Menu', 10: 'L3', 11: 'R3', 16: 'Xbox' },
  playstation: { 0: 'Cross', 1: 'Circle', 2: 'Square', 3: 'Triangle', 4: 'L1', 5: 'R1', 6: 'L2', 7: 'R2', 8: 'Create', 9: 'Options', 10: 'L3', 11: 'R3', 16: 'PS' },
  // Switch pads report by position: the bottom button (B on the pad) is button 0.
  switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 6: 'ZL', 7: 'ZR', 8: 'Minus', 9: 'Plus', 10: 'L3', 11: 'R3', 16: 'Home' },
};
/** A button's name on the connected controller (Xbox names when unknown). */
export function buttonName(b: number, style: PadStyle = 'xbox'): string {
  return NAMES[style][b] ?? `Button ${b}`;
}

/** Check a saved map: unknown junk falls back to the defaults; each button does one action only. */
export function sanitizePadMap(raw: unknown): PadMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const used = new Set<number>();
  const out = {} as PadMap;
  for (const a of PAD_ACTIONS) {
    const list = Array.isArray(r[a]) ? (r[a] as unknown[]) : DEFAULT_PAD_MAP[a];
    out[a] = [];
    for (const v of list) {
      const b = Number(v);
      if (!MAPPABLE.includes(b) || used.has(b) || out[a].length >= 4) continue;
      used.add(b);
      out[a].push(b);
    }
  }
  // Every action needs a button, or the player could lock themselves out.
  for (const a of PAD_ACTIONS) if (!out[a].length) return null;
  return out;
}

/** A map with `button` moved to `action` (taken away from any other action; that action keeps its others). */
export function assignButton(map: PadMap, action: PadAction, button: number, replace: boolean): PadMap {
  const out = {} as PadMap;
  for (const a of PAD_ACTIONS) out[a] = map[a].filter((b) => b !== button);
  out[action] = replace ? [button] : [...out[action], button].slice(-4);
  // Never leave another action with no button: give it back its default buttons that are free.
  for (const a of PAD_ACTIONS) {
    if (out[a].length) continue;
    const taken = new Set(PAD_ACTIONS.flatMap((x) => out[x]));
    const free = DEFAULT_PAD_MAP[a].filter((b) => !taken.has(b));
    out[a] = free.length ? free : [MAPPABLE.find((b) => !taken.has(b))!];
  }
  return out;
}

/** Hint text for the buttons of an action, for example "B / LT / RT". */
export function buttonsLabel(map: PadMap, action: PadAction, style: PadStyle = 'xbox'): string {
  return map[action].map((b) => buttonName(b, style)).join(' / ');
}

/** The HUD help line while a controller is in use. */
export function padHint(map: PadMap, style: PadStyle = 'xbox'): string {
  const l = (a: PadAction) => buttonsLabel(map, a, style);
  return `Controller: left stick swim | ${l('eat')} eat (green swallow, orange bite) | ${l('sprint')} sprint | ${l('ability')} ability | ${l('pause')} pause`;
}

/** Stick movement smaller than this is ignored (worn sticks drift). */
export const DEADZONE = 0.22;
/** A trigger counts as pressed past this. */
const TRIGGER = 0.3;
/** Seconds without any input before the pad stops counting as "in use" (the HUD shows touch hints again). */
const IDLE_SECONDS = 20;

type Source = () => ArrayLike<Gamepad | null>;
const browserPads: Source = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);

export class Pads {
  private cur: boolean[] = [];
  private prev: boolean[] = [];
  private lastPoll = -1;
  private lastUse = -Infinity;
  /** Left stick (or D-pad), -1..1 each, already past the dead zone. */
  x = 0;
  y = 0;
  /** Name of the first connected controller ('' when none). */
  name = '';
  /** Which buttons do which action (Options > Controller buttons). */
  map: PadMap = DEFAULT_PAD_MAP;

  constructor(
    private source: Source = browserPads,
    private now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  ) {}

  /** Read the controllers. Safe to call many times per frame: only the first call in a frame reads. */
  poll(): void {
    const t = this.now();
    if (t - this.lastPoll < 8) return;
    this.lastPoll = t;
    this.prev = this.cur;
    const cur: boolean[] = [];
    let x = 0;
    let y = 0;
    let name = '';
    for (const pad of Array.from(this.source())) {
      if (!pad || !pad.connected) continue;
      name ||= pad.id;
      pad.buttons.forEach((b, i) => {
        const on = i === PAD.LT || i === PAD.RT ? b.value > TRIGGER || b.pressed : b.pressed;
        cur[i] = cur[i] || on;
      });
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.hypot(ax, ay) > Math.hypot(x, y)) {
        x = ax;
        y = ay;
      }
    }
    // Dead zone, then rescale so movement starts smoothly at the edge of it.
    const m = Math.hypot(x, y);
    if (m < DEADZONE) {
      x = 0;
      y = 0;
    } else {
      const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
      x *= k;
      y *= k;
    }
    // The D-pad also steers (full speed).
    if (!x && !y) {
      x = (cur[PAD.RIGHT] ? 1 : 0) - (cur[PAD.LEFT] ? 1 : 0);
      y = (cur[PAD.DOWN] ? 1 : 0) - (cur[PAD.UP] ? 1 : 0);
    }
    this.cur = cur;
    this.x = x;
    this.y = y;
    this.name = name;
    if (x || y || cur.some(Boolean)) this.lastUse = t;
  }

  /** Xbox, PlayStation or Switch style names for the connected controller. */
  get style(): PadStyle {
    return padStyle(this.name);
  }

  get connected(): boolean {
    return this.name !== '';
  }

  /** True while the player has used a controller recently (the HUD swaps its hints). */
  get inUse(): boolean {
    return this.connected && this.now() - this.lastUse < IDLE_SECONDS * 1000;
  }

  down(button: number): boolean {
    return !!this.cur[button];
  }

  /** Pressed in this frame (was up in the frame before). */
  justDown(button: number): boolean {
    return !!this.cur[button] && !this.prev[button];
  }

  /** Any button of an in-game action held. */
  act(a: PadAction): boolean {
    return this.map[a].some((b) => this.down(b));
  }

  /** Any button of an in-game action pressed this frame. */
  actJust(a: PadAction): boolean {
    return this.map[a].some((b) => this.justDown(b));
  }

  /** The first mappable button pressed this frame (for "press a button" mapping), or -1. */
  firstPressed(): number {
    return MAPPABLE.find((b) => this.justDown(b)) ?? -1;
  }
}

/** The game's one controller reader. */
export const pads = new Pads();
