// Gates between regions (balance.json "gates"): walls across the whole water column that you can
// only break after beating the Tide's Checkpoint Crab. Pure rules here (unit tested); the pictures,
// hits and messages live in GateSystem (src/scenes/GateSystem.ts).

export type GateAction = 'bite' | 'ram';
export type GateStyle = 'roots' | 'rocks' | 'ice';

export interface GateDef {
  id: string;
  name: string;
  /** World x of the wall's center. */
  x: number;
  /** The Checkpoint Crab level you must have beaten (crabLevel >= this) to break it. */
  crab: number;
  action: GateAction;
  /** Hits to break it. */
  hits: number;
  style: GateStyle;
  /** The region it opens (for the banner). */
  opens: string;
}

export interface GatesConfig {
  /** Wall thickness (world px). */
  thickness: number;
  /** Seconds between two hits that count. */
  hitCooldown: number;
  /** Seconds between two "not yet" messages. */
  messageSeconds: number;
  /** Speed you bounce back with after ramming. */
  bounce: number;
  /** A ram counts above this share of your cruising speed (aimed at the wall). */
  ramSpeedRatio: number;
  list: GateDef[];
}

/** x - gateX on the looping sea, folded into [-W/2, W/2). */
export function loopDx(x: number, gateX: number, W: number): number {
  let d = (x - gateX) % W;
  if (d >= W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
}

/** Can this gate be broken yet? */
export function canBreak(g: GateDef, crabLevel: number): boolean {
  return crabLevel >= g.crab;
}

/** How cracked a gate looks after `hits` of `needed` hits (0 = whole, 3 = about to break). */
export function crackStage(hits: number, needed: number): number {
  if (hits <= 0) return 0;
  return Math.min(3, Math.ceil((hits / needed) * 3));
}

/**
 * Keep a swimmer of radius r out of a gate: if it overlaps the wall, the x it is pushed back to
 * (on the side it is on) and that side (-1 left, 1 right); null if it does not touch the wall.
 */
export function pushOut(x: number, r: number, gateX: number, half: number, W: number, vx = 0): { x: number; side: number } | null {
  const d = loopDx(x, gateX, W);
  if (Math.abs(d) >= half + r) return null;
  const side = d > 0 ? 1 : d < 0 ? -1 : vx > 0 ? -1 : 1;
  return { x: x - d + side * (half + r), side };
}

/** Gates open in a saved run. Older saves (no list) keep the whole sea open, so no one gets locked in. */
export function openedFromSave(saved: string[] | undefined, all: GateDef[]): string[] {
  if (!Array.isArray(saved)) return all.map((g) => g.id);
  const ids = new Set(all.map((g) => g.id));
  return saved.filter((id) => ids.has(id));
}
