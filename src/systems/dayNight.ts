// Day and night: four periods (Dawn, Day, Dusk, Night) that blend smoothly into each other.
//
// Pure math (no Phaser): `lightAt(seconds)` gives the look (sky, water tint, light rays, darkness,
// stars, plankton glow) and the gameplay changes (how far fish see, how hungry predators get,
// how much plankton there is, how sleepy small fish are) at any moment of the cycle.
// The game, the light overlay and the HUD all read from it. Numbers live in balance.json "dayNight".

export const PERIODS = ['dawn', 'day', 'dusk', 'night'] as const;
export type Period = (typeof PERIODS)[number];

/** Everything that changes with the time of day. Colors are 0xRRGGBB. */
export interface Light {
  sky: number;
  /** Water tint over the whole view, and how strong it is (0..1). */
  tint: number;
  tintAlpha: number;
  /** Light rays from the surface (0..1). */
  rays: number;
  /** Darkness closing in around the player (0..1). */
  dark: number;
  stars: number;
  /** Plankton glow (0..1). */
  glow: number;
  /** How far fish see (1 = normal). */
  preyVision: number;
  predatorVision: number;
  /** How fast predators get hungry again (1 = normal). */
  predatorHunger: number;
  /** How much plankton floats around (1 = normal). */
  plankton: number;
  /** Small fish rest and drift slowly (0 = awake, 1 = sleepy). */
  sleepy: number;
}

export interface DayNightConfig {
  /** Seconds each period lasts, in order: dawn, day, dusk, night. */
  seconds: Record<Period, number>;
  /** Seconds a change takes to blend from one period into the next. */
  blendSeconds: number;
  /** Where a new run starts. */
  startAt: Period;
  /** The look and gameplay of each period at its fullest. */
  periods: Record<Period, Omit<Light, 'sky' | 'tint'> & { sky: string; tint: string; name: string; line: string }>;
}

const hexNum = (h: string) => parseInt(h.replace('#', ''), 16);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
function mixColor(a: number, b: number, k: number): number {
  const r = Math.round(mix((a >> 16) & 255, (b >> 16) & 255, k));
  const g = Math.round(mix((a >> 8) & 255, (b >> 8) & 255, k));
  const bl = Math.round(mix(a & 255, b & 255, k));
  return (r << 16) | (g << 8) | bl;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export class DayNight {
  readonly length: number;
  private starts: number[];
  private keys: Light[];

  constructor(readonly cfg: DayNightConfig) {
    let t = 0;
    this.starts = PERIODS.map((p) => {
      const s = t;
      t += Math.max(1, cfg.seconds[p]);
      return s;
    });
    this.length = t;
    this.keys = PERIODS.map((p) => {
      const k = cfg.periods[p];
      return { ...k, sky: hexNum(k.sky), tint: hexNum(k.tint) };
    });
  }

  /** Seconds into the cycle where a period starts. */
  startOf(p: Period): number {
    return this.starts[PERIODS.indexOf(p)];
  }

  private wrap(t: number): number {
    return ((t % this.length) + this.length) % this.length;
  }

  /** Which period it is (the one whose time it is, ignoring the blend). */
  periodAt(t: number): Period {
    const x = this.wrap(t);
    let i = PERIODS.length - 1;
    while (i > 0 && x < this.starts[i]) i--;
    return PERIODS[i];
  }

  /** How far through the current period (0..1). */
  progressAt(t: number): number {
    const x = this.wrap(t);
    const i = PERIODS.indexOf(this.periodAt(x));
    return (x - this.starts[i]) / Math.max(1, this.cfg.seconds[PERIODS[i]]);
  }

  /** How far through the whole day (0..1, starting at dawn). Used for the sun and moon. */
  cycleAt(t: number): number {
    return this.wrap(t) / this.length;
  }

  /**
   * The light at a moment: a period holds its own look, and near each change of period the two
   * looks blend over `blendSeconds` (centered on the change), with an ease in and out.
   */
  lightAt(t: number): Light {
    const x = this.wrap(t);
    const half = Math.max(0.5, this.cfg.blendSeconds / 2);
    for (let i = 0; i < PERIODS.length; i++) {
      const b = this.starts[i]; // change from period i-1 into period i
      // Distance to this change, going around the cycle.
      let d = x - b;
      if (d > this.length / 2) d -= this.length;
      if (d < -this.length / 2) d += this.length;
      if (Math.abs(d) < half) {
        const from = this.keys[(i + PERIODS.length - 1) % PERIODS.length];
        const to = this.keys[i];
        return blend(from, to, smooth((d + half) / (2 * half)));
      }
    }
    return { ...this.keys[PERIODS.indexOf(this.periodAt(x))] };
  }
}

export function blend(a: Light, b: Light, k: number): Light {
  const out = {} as Light;
  for (const key of Object.keys(a) as Array<keyof Light>) {
    if (key === 'sky' || key === 'tint') out[key] = mixColor(a[key], b[key], k);
    else if (typeof a[key] === 'number') (out[key] as number) = mix(a[key] as number, b[key] as number, k);
  }
  return out;
}
