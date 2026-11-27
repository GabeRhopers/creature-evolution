// The Fisher Ape's rules (pure, unit tested in tests/fisher.test.ts). Rhopers, Nov 27: a monkey in a rowboat sometimes drifts in
// over the shallow regions in daylight and fishes: his line drops a hook, small fish that touch it are reeled up, and a hero that
// touches it is hooked (hurt, and pulled up if still small). Ramming or leaping into the boat scares him away.

export interface FisherConfig {
  regions: string[];
  periods: string[];
  firstAfter: number;
  everyMin: number;
  everyMax: number;
  stay: number;
  catches: number;
  arriveDistance: number;
  arriveSpeed: number;
  leaveSpeed: number;
  castSeconds: number;
  lineSpeed: number;
  waitMin: number;
  waitMax: number;
  reelSpeed: number;
  catchSeconds: number;
  hookDepthMin: number;
  hookDepthMax: number;
  hookSwing: number;
  hookRadius: number;
  catchMaxSize: number;
  hookDamageFraction: number;
  pullSpeed: number;
  pullStages: string[];
  breakSprintSeconds: number;
  rehookSeconds: number;
  boatHitsToScare: number;
  boatHitCooldown: number;
  boatHitSpeedRatio: number;
  scareXpShare: number;
  artScale: number;
}

export type FisherState = 'away' | 'arrive' | 'cast' | 'drop' | 'wait' | 'reel' | 'catch' | 'leave';

/** Seconds until the next visit, between everyMin and everyMax (`r` in 0..1). */
export function nextVisit(cfg: FisherConfig, r: number): number {
  return cfg.everyMin + (cfg.everyMax - cfg.everyMin) * Math.min(1, Math.max(0, r));
}

/** May he come now: the player in one of his regions, at a time of day he fishes, not in a boss cave, not on land. */
export function canVisit(cfg: FisherConfig, region: string, period: string, inArena: boolean): boolean {
  return !inArena && cfg.regions.includes(region) && cfg.periods.includes(period);
}

/** A fish small enough for his hook. */
export const hookCatches = (cfg: FisherConfig, fishSize: number): boolean => fishSize <= cfg.catchMaxSize;

/** Is the hero still small enough to be pulled up (else the hook just stings and the line snaps)? */
export const heroPulled = (cfg: FisherConfig, stageId: string | undefined): boolean => !!stageId && cfg.pullStages.includes(stageId);

/** How deep the hook goes (world y): a share of the water between the surface and the seabed (`r` in 0..1). */
export function hookDepth(cfg: FisherConfig, surfaceY: number, seabedTop: number, r: number): number {
  const share = cfg.hookDepthMin + (cfg.hookDepthMax - cfg.hookDepthMin) * Math.min(1, Math.max(0, r));
  return surfaceY + (seabedTop - surfaceY) * share;
}

/** Hook damage: a share of the hero's health, never the last bit (the hook alone never kills). */
export function hookDamage(cfg: FisherConfig, hp: number, maxHp: number): number {
  return Math.max(0, Math.min(maxHp * cfg.hookDamageFraction, hp - 1));
}
