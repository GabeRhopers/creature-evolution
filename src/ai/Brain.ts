import Phaser from 'phaser';
import { BALANCE, type Difficulty } from '../data';
import type { Fish, SwimIntent } from '../entities/Fish';
import type { FoodField, FoodItem } from '../entities/Food';

/** Anything that swims in the world: the player or an AI fish. */
export interface Creature {
  fish: Fish;
  isPlayer: boolean;
  brain?: Brain;
  /** Depth band an AI fish lives in (wander targets + respawn). */
  band?: Phaser.Geom.Rectangle;
  /** Where it likes to live (regions): a wander target near `near`, or a spot in a region it likes. */
  homeX?: (near?: number) => number | null;
  /** Asleep: very far from the player, not out (time of day, waves) or waiting to respawn: not simulated (GameScene). */
  asleep?: boolean;
  /** Not out right now (spawn factors: time of day, waves, last level). */
  away?: boolean;
  /** Seconds until it comes back after being eaten (spawn factor respawnDelay). */
  respawnT?: number;
  /** 0..1, fixed per fish: it is out when the species' out share is above it. */
  slot?: number;
  /** A guardian (the Checkpoint Crab) stays in its band, fights only the player, never flees, and other fish leave it alone. */
  guardian?: boolean;
}

/** What a brain needs from the world. GameScene implements this. */
export interface AIWorld {
  creatures: Creature[];
  food: FoodField;
  difficulty: Difficulty;
  swimArea: Phaser.Geom.Rectangle;
  /** True if `target` is hidden from `observer` (e.g. inside kelp). */
  isHidden(target: Fish, observer: Fish): boolean;
  /** Terrain (seamounts, dunes, islands): solid test and a steer away from it. */
  terrain?: { isSolid(x: number, y: number, r?: number): boolean; avoid(x: number, y: number, margin?: number): [number, number] };
  /** Time of day: how far fish see, how hungry predators get, how sleepy small fish are. */
  light?: { preyVision: number; predatorVision: number; predatorHunger: number; sleepy: number };
  /** The sea loops: the copy of x nearest to `near`. */
  wrapNear?(x: number, near: number): number;
  /** Creatures near a point (a spatial grid, rebuilt each frame), written into `out`. Without it, all creatures. */
  nearby?(x: number, y: number, r: number, out: Creature[]): Creature[];
  /** Region twist: how far fish see at x (1 = normal; murky water less). */
  visionAt?(x: number): number;
}

// Reused lists for nearby creatures (brains think one at a time).
const SEEN: Creature[] = [];
const MATES: Creature[] = [];

export type BrainState = 'wander' | 'flee' | 'hunt' | 'forage' | 'rest';

/**
 * Finite state machine for one AI fish.
 *
 *  wander --(sees something that can swallow it)--> flee
 *  wander --(hungry + sees swallowable prey)-------> hunt --(caught)--> rest
 *  wander --(hungry + plankton eater + sees food)--> forage
 *  any    --(hunger < desperate)--> leaves its school, hunts any tier, sees farther
 *  any    --(bitten)--> flees a bigger attacker, or fights back if aggressive
 *
 * Prey can be swallowable (eaten whole) or, for aggressive species, biteable
 * (smaller than the hunter but too big to swallow): GameScene decides which.
 * Wounded fish are visible from farther away and hunted even by fed predators.
 *
 * Leash: big predators (tier >= leashFromTier) do not chase prey far above
 * their home depth band, so shallow water is a safer place to grow up.
 *
 * Perception runs every `difficulty.aiReactionDelay` seconds (slower on Easy),
 * not every frame: cheaper, and it gives the player a reaction window.
 * Eating itself is resolved by GameScene (it owns removal and respawn).
 */
export class Brain {
  state: BrainState = 'wander';
  hunger: number;
  target: Creature | null = null;
  foodTarget: FoodItem | null = null;
  private threat: Creature | null = null;
  private stateTime = 0;
  private sinceThreat = 99;
  private scanTimer: number;
  private wanderX = 0;
  private wanderY = 0;
  private wanderTimer = 0;
  /** Ambushers lunge once per hunt. */
  private lunged = false;

  constructor(
    private self: Creature,
    private world: AIWorld,
  ) {
    this.hunger = Phaser.Math.FloatBetween(0.3, 1);
    this.scanTimer = Math.random() * 0.5; // stagger scans across fish
    this.pickWanderPoint();
  }

  get fish(): Fish {
    return this.self.fish;
  }

  get desperate(): boolean {
    return this.hunger < BALANCE.ai.desperateBelowHunger;
  }

  get hungry(): boolean {
    return this.hunger < BALANCE.ai.huntBelowHunger;
  }

  /** Called by GameScene when this fish swallowed something. */
  ate(kind: 'fish' | 'food'): void {
    const ai = BALANCE.ai;
    this.hunger = Math.min(1, this.hunger + (kind === 'fish' ? ai.hungerPerFish : ai.hungerPerPlankton));
    this.target = null;
    this.foodTarget = null;
    if (kind === 'fish') this.setState('rest');
  }

  /** Called by GameScene when this fish is bitten or rammed. */
  onHurt(attacker: Creature): void {
    if (this.self.guardian) {
      if (attacker.isPlayer) this.target = attacker;
      return;
    }
    const me = this.fish;
    if (attacker.fish.rank > me.rank * 0.8) {
      this.threat = attacker;
      this.sinceThreat = 0;
      this.setState('flee');
    } else if (me.species.behavior.aggression >= 0.3) {
      this.target = attacker;
      this.setState('hunt');
    }
  }

  /** Can this fish attack `c` by biting (too big to swallow, small enough to fight)? */
  canBite(c: Creature): boolean {
    const cb = BALANCE.combat;
    const me = this.fish;
    return me.species.behavior.aggression >= cb.aiBiteMinAggression && c.fish.rank <= me.rank * cb.aiBiteMaxSizeRatio;
  }

  /** Is `c` dangerous to this fish? Swallowers always; big aggressive biters too. */
  private isThreat(c: Creature): boolean {
    const me = this.fish;
    if (c.fish.canSwallow(me.size)) return true;
    const aggressive = c.isPlayer || c.fish.species.behavior.aggression >= BALANCE.combat.aiBiteMinAggression;
    return aggressive && c.fish.rank >= me.rank * BALANCE.combat.threatSizeRatio;
  }

  /** Forget a target that no longer exists (eaten by someone else, respawned). */
  forget(c: Creature): void {
    if (this.target === c) {
      this.target = null;
      if (this.state === 'hunt') this.setState('wander');
    }
    if (this.threat === c) this.threat = null;
  }

  think(dt: number): SwimIntent {
    if (this.self.guardian) return this.guardIntent(dt);
    const ai = BALANCE.ai;
    // Predators get hungry faster at dawn and dusk (the twilight hunting hours).
    const hungerMul = this.fish.species.tier >= 3 ? (this.world.light?.predatorHunger ?? 1) : 1;
    this.hunger = Math.max(0, this.hunger - ai.hungerDrainPerSecond * hungerMul * dt);
    this.stateTime += dt;
    this.sinceThreat += dt;
    if (this.foodTarget && !this.foodTarget.alive) this.foodTarget = null;

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) {
      this.scanTimer = this.world.difficulty.aiReactionDelay + Math.random() * 0.1;
      this.decide();
    }

    switch (this.state) {
      case 'flee':
        return this.fleeIntent();
      case 'hunt':
        return this.huntIntent();
      case 'forage':
        return this.forageIntent();
      case 'rest':
        if (this.stateTime > ai.restSeconds) this.setState('wander');
        return { ...this.wanderIntent(dt), strength: 0.15 };
      default:
        return this.wanderIntent(dt);
    }
  }

  // ------------------------------------------------------------ decisions

  private decide(): void {
    const me = this.fish;
    const sp = me.species;
    // Time of day: everyone sees less at night; predators see better than prey in the dim light.
    const light = this.world.light;
    const dayMul = light ? (sp.tier >= 3 ? light.predatorVision : light.preyVision) : 1;
    const murk = this.world.visionAt ? this.world.visionAt(me.x) : 1;
    const vision = sp.behavior.visionRange * dayMul * murk * (this.desperate ? BALANCE.ai.desperateVisionMul : 1) * Math.max(1, me.size / sp.baseSize);

    let threat: Creature | null = null;
    let threatD = Infinity;
    let prey: Creature | null = null;
    let preyScore = -Infinity;

    // Only creatures within sight (a wounded one is noticed from farther away).
    const reach = vision * Math.max(1, BALANCE.combat.distressVisionMul);
    const around = this.world.nearby ? this.world.nearby(me.x, me.y, reach, SEEN) : this.world.creatures;
    for (const c of around) {
      // The crab is left alone; a hidden player (home screen, dead) is not there. Far AI fish are only
      // undrawn (culled), not gone, so their `visible` flag does not matter here.
      if (c === this.self || !c.fish.active || c.asleep || (c.isPlayer && !c.fish.visible) || c.guardian) continue;
      const d = Phaser.Math.Distance.Between(me.x, me.y, c.fish.x, c.fish.y);
      // Wounded fish send distress: noticed from farther away.
      const range = c.fish.wounded ? vision * BALANCE.combat.distressVisionMul : vision;
      if (d > range) continue;
      if (this.world.isHidden(c.fish, me)) continue;

      if (this.isThreat(c)) {
        if (d < threatD) {
          threat = c;
          threatD = d;
        }
        continue;
      }
      // Prey: swallowable or biteable, diet allows. Hungry fish hunt;
      // any predator goes for wounded prey.
      const wantsFood = this.hungry || this.desperate || c.fish.wounded;
      if (!wantsFood || !this.dietAllows(c)) continue;
      if (!me.canSwallow(c.fish.size) && !this.canBite(c)) continue;
      if (this.beyondLeash(c.fish.y, 1)) continue;
      if (c.isPlayer && sp.behavior.aggression <= 0) continue;
      // Prefer big, close, wounded meals.
      // Stick with the current target unless something clearly better shows up.
      const score = c.fish.size * 2 - d * 0.05 + (c.fish.wounded ? 200 : 0) + (c === this.target ? 40 : 0);
      if (score > preyScore) {
        prey = c;
        preyScore = score;
      }
    }

    if (threat) {
      this.threat = threat;
      this.sinceThreat = 0;
      if (this.state !== 'flee') this.setState('flee');
      return;
    }
    if (this.state === 'flee' && this.sinceThreat < BALANCE.ai.fleeMemorySeconds) return;
    if (this.state === 'rest') return;

    if (prey) {
      if (this.target !== prey) this.stateTime = 0;
      this.target = prey;
      this.state = 'hunt';
      return;
    }
    if (this.state === 'hunt') {
      // Lost sight of the target.
      this.target = null;
      this.setState('wander');
    }

    if ((this.hungry || this.desperate) && sp.diet.includes('food')) {
      const f = this.nearestFood(vision * 0.6);
      if (f) {
        this.foodTarget = f;
        if (this.state !== 'forage') this.setState('forage');
        return;
      }
    }
    if (this.state === 'forage' && !this.foodTarget) this.setState('wander');
    if (this.state === 'flee') this.setState('wander');
  }

  /** True if `y` is too far above this predator's home band to chase. */
  private beyondLeash(y: number, slack: number): boolean {
    const band = this.self.band;
    if (!band || this.fish.species.tier < BALANCE.ai.leashFromTier || this.desperate) return false;
    return y < band.top - BALANCE.ai.predatorLeash * slack;
  }

  private dietAllows(c: Creature): boolean {
    if (this.desperate) return true;
    return this.fish.species.diet.includes(`tier${c.fish.species.tier}`);
  }

  private nearestFood(range: number): FoodItem | null {
    const me = this.fish;
    let best: FoodItem | null = null;
    let bestD = range;
    for (const f of this.world.food.items) {
      if (!me.canSwallow(f.size)) continue;
      const d = Phaser.Math.Distance.Between(me.x, me.y, f.img.x, f.img.y);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  private setState(s: BrainState): void {
    this.state = s;
    this.stateTime = 0;
    this.lunged = false;
  }

  // ------------------------------------------------------------ steering

  private fleeIntent(): SwimIntent {
    const me = this.fish;
    const t = this.threat?.fish;
    if (!t) return this.wanderIntent(0);
    let dx = me.x - t.x;
    let dy = me.y - t.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    // Steer away from walls so fleeing fish do not pin themselves.
    const [ax, ay] = this.avoidEdges(me.x, me.y);
    const close = d < me.species.behavior.visionRange * 0.5;
    return { dirX: dx + ax, dirY: dy + ay, strength: 1, sprint: close && me.stamina > 10 };
  }

  private huntIntent(): SwimIntent {
    const me = this.fish;
    const t = this.target?.fish;
    if (!t || !t.active || this.stateTime > BALANCE.ai.giveUpAfterSeconds || this.beyondLeash(t.y, 1.6)) {
      this.target = null;
      this.setState('wander');
      return this.wanderIntent(0);
    }
    // Ambushers (moray eel): one fast lunge at the start, then a short chase, then back to lurking.
    if (me.species.behavior.ambush) {
      if (!this.lunged) {
        this.lunged = true;
        me.heading = Math.atan2(t.y - me.y, t.x - me.x);
        me.tryDash();
      } else if (this.stateTime > BALANCE.ai.ambushChaseSeconds) {
        this.target = null;
        this.setState('rest');
        return { ...this.wanderIntent(0), strength: 0 };
      }
    }
    // Lead the target a little.
    const v = t.arcadeBody.velocity;
    const px = t.x + v.x * 0.3;
    const py = t.y + v.y * 0.3;
    const d = Phaser.Math.Distance.Between(me.x, me.y, px, py);
    // Against the player, predators stalk first (slow approach, no sprint)
    // so the HUD warning gives a fair chance to flee or hide.
    const stalking = this.target!.isPlayer && this.stateTime < BALANCE.ai.stalkSecondsBeforeChasingPlayer;
    const sprint = !stalking && d < me.species.behavior.visionRange * 0.45 && me.stamina > 35;
    return { dirX: px - me.x, dirY: py - me.y, strength: stalking ? 0.5 : 1, sprint };
  }

  private forageIntent(): SwimIntent {
    const me = this.fish;
    const f = this.foodTarget;
    if (!f || !f.alive) {
      this.foodTarget = null;
      this.setState('wander');
      return this.wanderIntent(0);
    }
    return { dirX: f.img.x - me.x, dirY: f.img.y - me.y, strength: 0.7, sprint: false };
  }

  /** Guardian: chase the player while it is within `guardRange` of home, otherwise patrol home. */
  private guardIntent(dt: number): SwimIntent {
    const me = this.fish;
    const home = this.self.band ?? this.world.swimArea;
    const player = this.world.creatures.find((c) => c.isPlayer);
    const range = BALANCE.checkpointCrab.guardRange;
    const near =
      player &&
      player.fish.active &&
      Phaser.Math.Distance.Between(home.centerX, home.centerY, player.fish.x, player.fish.y) < range + home.width / 2;
    if (near && player) {
      this.target = player;
      this.setState('hunt');
      return { dirX: player.fish.x - me.x, dirY: player.fish.y - me.y, strength: 0.85, sprint: false };
    }
    this.target = null;
    if (this.state !== 'wander') this.setState('wander');
    return this.wanderIntent(dt);
  }

  private wanderIntent(dt: number): SwimIntent {
    const me = this.fish;
    const ai = BALANCE.ai;
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 || Phaser.Math.Distance.Between(me.x, me.y, this.wanderX, this.wanderY) < me.size * 2) {
      this.pickWanderPoint();
    }
    let dx = this.wanderX - me.x;
    let dy = this.wanderY - me.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    // Schooling (boids-lite): match heading and stay near same-species neighbors.
    if (me.species.behavior.schooling && !this.desperate) {
      let n = 0;
      let hx = 0;
      let hy = 0;
      let cx = 0;
      let cy = 0;
      let sx = 0;
      let sy = 0;
      const mates = this.world.nearby ? this.world.nearby(me.x, me.y, ai.schoolRadius, MATES) : this.world.creatures;
      for (const c of mates) {
        const o = c.fish;
        if (c === this.self || c.isPlayer || c.asleep || o.species !== me.species) continue;
        const d = Phaser.Math.Distance.Between(me.x, me.y, o.x, o.y);
        if (d > ai.schoolRadius) continue;
        n++;
        hx += Math.cos(o.heading);
        hy += Math.sin(o.heading);
        cx += o.x;
        cy += o.y;
        if (d < me.size * 3) {
          sx += (me.x - o.x) / (d || 1);
          sy += (me.y - o.y) / (d || 1);
        }
      }
      if (n > 0) {
        const tx = cx / n - me.x;
        const ty = cy / n - me.y;
        const tl = Math.hypot(tx, ty) || 1;
        dx = dx * 0.35 + (hx / n) * 0.35 + (tx / tl) * 0.2 + sx * 0.6;
        dy = dy * 0.35 + (hy / n) * 0.35 + (ty / tl) * 0.2 + sy * 0.6;
      }
    }
    // Slide around seamounts and islands instead of pressing into them.
    const t = this.world.terrain?.avoid(me.x, me.y, 120 + me.size * 2);
    if (t) {
      dx += t[0];
      dy += t[1];
    }
    // Ambushers barely move while they wait.
    // Small fish rest at night: they drift slowly.
    const sleepy = me.species.tier <= 1 ? 1 - 0.6 * (this.world.light?.sleepy ?? 0) : 1;
    return { dirX: dx, dirY: dy, strength: (me.species.behavior.ambush ? ai.ambushLurkStrength : ai.wanderStrength) * sleepy, sprint: false };
  }

  private pickWanderPoint(): void {
    const b = this.self.band ?? this.world.swimArea;
    // Never aim inside a seamount or an island: try a few points.
    for (let i = 0; i < 8; i++) {
      this.wanderX = this.self.homeX?.(this.fish.x) ?? Phaser.Math.Between(b.left, b.right);
      this.wanderY = Phaser.Math.Between(b.top, b.bottom);
      // Aim at the nearest copy of that spot (the sea loops), not across the whole world.
      if (this.world.wrapNear) this.wanderX = this.world.wrapNear(this.wanderX, this.fish.x);
      if (!this.world.terrain?.isSolid(this.wanderX, this.wanderY, this.fish.size)) break;
    }
    this.wanderTimer = Phaser.Math.FloatBetween(3, 8);
  }

  private avoidEdges(x: number, y: number): [number, number] {
    const a = this.world.swimArea;
    const m = 250;
    let ax = 0;
    let ay = 0;
    if (x - a.left < m) ax += 1 - (x - a.left) / m;
    if (a.right - x < m) ax -= 1 - (a.right - x) / m;
    if (y - a.top < m) ay += 1 - (y - a.top) / m;
    if (a.bottom - y < m) ay -= 1 - (a.bottom - y) / m;
    const t = this.world.terrain?.avoid(x, y, m);
    if (t) {
      ax += t[0];
      ay += t[1];
    }
    return [ax * 1.5, ay * 1.5];
  }
}
