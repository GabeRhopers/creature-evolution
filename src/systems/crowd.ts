/**
 * Crowd control: keeps the sea lively but never packed (balance.json "crowd"). Pure functions; GameScene applies them.
 *
 * 1. Region density cap: every region holds at most `regionMaxDensity` fish per 1000 px of width. A region whose
 *    species add up to more (the Swamp's archerfish, the Trench's lanternfish, the ice's cod) has all its species
 *    thinned by the same factor, so the mix stays the same and only the crowd shrinks.
 * 2. Outgrown fish: fish far weaker than the player (rank ratio above `outgrownRankRatio`) are background; only
 *    `outgrownShare` of them stay out, the rest hide (sleep) until you are back among equals.
 * 3. Screen budget: at most `nearMax` awake fish within `nearRadius` of the player. Extra ones that are off screen
 *    sleep (farthest first) and wake again off screen once the crowd thins.
 * 4. Hunter cap: at most `maxHuntersTotal` fish of all species hunt the player at once.
 * 5. Tide growth cap: Tides add enemies, up to `maxTideMul` x the base count.
 */
export interface CrowdConfig {
  regionMaxDensity: number;
  maxTideMul: number;
  outgrownRankRatio: number;
  outgrownShare: number;
  nearRadius: number;
  nearMax: number;
  nearWake: number;
  maxHuntersTotal: number;
}

export interface RegionSpan {
  id: string;
  from: number;
  to: number;
}

/** Fish per 1000 px in each region, from the species counts and their region weights (weight x width shares). */
export function regionDensities(
  counts: Record<string, number>,
  weight: (species: string, region: string) => number,
  regions: RegionSpan[],
): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(regions.map((r) => [r.id, 0]));
  for (const [id, n] of Object.entries(counts)) {
    const w = regions.map((r) => weight(id, r.id) * (r.to - r.from));
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    regions.forEach((r, i) => (out[r.id] += (n * w[i]) / total / ((r.to - r.from) / 1000)));
  }
  return out;
}

/** How much to thin each region (1 = keep all), so no region is denser than `cap` fish per 1000 px. */
export function regionFactors(densities: Record<string, number>, cap: number): Record<string, number> {
  return Object.fromEntries(Object.entries(densities).map(([id, d]) => [id, d > cap && d > 0 ? cap / d : 1]));
}

/**
 * The share of a species' full count it keeps after thinning: its regions' factors, weighted by how many of its
 * fish each region would hold.
 */
export function keptShare(
  id: string,
  weight: (species: string, region: string) => number,
  regions: RegionSpan[],
  factors: Record<string, number>,
): number {
  let all = 0, kept = 0;
  for (const r of regions) {
    const w = weight(id, r.id) * (r.to - r.from);
    all += w;
    kept += w * (factors[r.id] ?? 1);
  }
  return all > 0 ? kept / all : 1;
}

/** Multiplier on a fish's "out" share: 1, or `outgrownShare` once the player is far stronger than it. */
export function outgrownMul(playerRank: number, fishRank: number, cfg: CrowdConfig): number {
  return fishRank > 0 && playerRank > fishRank * cfg.outgrownRankRatio ? cfg.outgrownShare : 1;
}

/**
 * Screen budget. `near` lists the awake fish around the player (distance, on screen or not). Returns the indices
 * (into `near`) to put to sleep: off-screen ones only, farthest first, until at most `max` stay awake.
 */
export function trimCrowd(near: Array<{ d: number; onScreen: boolean }>, max: number): number[] {
  const extra = near.length - max;
  if (extra <= 0) return [];
  return near
    .map((n, i) => ({ ...n, i }))
    .filter((n) => !n.onScreen)
    .sort((a, b) => b.d - a.d)
    .slice(0, extra)
    .map((n) => n.i);
}
