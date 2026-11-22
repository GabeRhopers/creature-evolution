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
}

/** The game's one controller reader. */
export const pads = new Pads();
