import Phaser from 'phaser';
import { Brain, type AIWorld, type Creature } from '../ai/Brain';
import { BALANCE, getSpecies } from '../data';
import { Fish, NO_INTENT, type SwimIntent } from '../entities/Fish';
import { bossPhase, type BossDef, type BossMode } from '../systems/bosses';

/**
 * Bosses (balance.json "bosses"). The first is the Electric Eel in the Coral Cave (Coral Sea, level 15): a guardian
 * in its own arena (GameScene asks before you enter; it appears when you do) that fights with telegraphed moves. Pure rules live in
 * src/systems/bosses.ts; GameScene owns creatures, damage and saving, and calls in through `BossHost`.
 *
 *   hunt  -> charge (crackles, can't move)       -> shock ring around it
 *   hunt  -> rise (swims up to the air hole)      -> gulp (still, takes double damage, can't shock)
 *   below half health: while gulping it leaps and shocks anyone near the air hole.
 */
export interface BossHost {
  scene: Phaser.Scene;
  world: AIWorld;
  player: Fish;
  playerCreature: Creature;
  creatures: Creature[];
  dead: boolean;
  surfaceY: number;
  /** Ceiling (cave roof) and ground at x. */
  ceilAt(x: number): number;
  groundAt(x: number): number;
  /** Build the boss fish (look, art) and add it to the world. */
  addCreature(fish: Fish, c: Creature): void;
  /** Damage the player (share of max health, stun seconds), from `by`. */
  hurtPlayer(by: Creature, hpFraction: number, stunSeconds: number, label: string): void;
  bossBar(name: string | null, ratio: number, weak: boolean): void;
  banner(title: string, line: string): void;
  popup(text: string, x: number, y: number, color: string): void;
  sfx(kind: 'zap' | 'warn' | 'gulp' | 'roar'): void;
  /** Already beaten in this run. */
  beaten(id: string): boolean;
  /** The boss arena the player is in (its boss id), or null. */
  arena(): string | null;
  defeated(id: string, c: Creature): void;
}

/** The boss's brain: hunts like a guardian, but its moves (from BossSystem) take over its swimming. */
class BossBrain extends Brain {
  mode: BossMode = 'hunt';
  air = { x: 0, y: 0 };
  think(dt: number): SwimIntent {
    if (this.mode === 'charge' || this.mode === 'gulp') return NO_INTENT;
    if (this.mode === 'rise') return { dirX: this.air.x - this.fish.x, dirY: this.air.y - this.fish.y, strength: 1, sprint: true };
    return this.guardIntent(dt);
  }
}

interface Active {
  def: BossDef;
  c: Creature;
  brain: BossBrain;
  mode: BossMode;
  t: number;
  shockIn: number;
  breathIn: number;
  leaped: boolean;
  introduced: boolean;
  ring: Phaser.GameObjects.Graphics;
}

export class BossSystem {
  private active: Active | null = null;
  readonly defs: BossDef[] = (BALANCE.bosses.list as unknown as BossDef[]).slice();

  constructor(private host: BossHost) {}

  /** The boss being fought (or waiting in its cave), if any. */
  get current(): Creature | null {
    return this.active?.c ?? null;
  }
  /** True while the boss gulps air: bites do `breath.damageMul` x damage. */
  get weak(): boolean {
    return this.active?.mode === 'gulp';
  }
  damageMulAgainst(c: Creature): number {
    return this.active && this.active.c === c && this.weak ? this.active.def.breath.damageMul : 1;
  }
  /** The cave the player is in (for darkness), if any. */
  caveAt(x: number, y: number): BossDef | null {
    for (const d of this.defs) if (x > d.left && x < d.right && y > this.host.surfaceY && y < this.host.groundAt(x)) return d;
    return null;
  }

  update(dt: number, level: number): void {
    const h = this.host;
    if (!this.active) {
      if (h.dead) return;
      // It waits in its arena: it appears when the player enters.
      const id = h.arena();
      const d = this.defs.find((b) => b.id === id);
      if (d && level >= d.level && !h.beaten(d.id)) this.spawn(d);
      return;
    }
    const a = this.active;
    const f = a.c.fish;
    if (!f.active) {
      this.clear();
      return;
    }
    const p = h.player;
    const engaged = !h.dead && h.arena() === a.def.id;
    if (engaged && !a.introduced) {
      a.introduced = true;
      h.banner(a.def.name.toUpperCase(), getSpecies(a.def.species).intro ?? '');
      h.sfx('roar');
    }
    h.bossBar(engaged ? a.def.name : null, f.hp / f.maxHp, a.mode === 'gulp');
    if (!engaged) {
      // You left the cave: it calms down, heals slowly and waits.
      if (a.mode !== 'hunt') this.setMode(a, 'hunt');
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * a.def.regenPerSecond * dt);
      a.ring.clear();
      return;
    }
    a.t += dt;
    const phase2 = bossPhase(f.hp / f.maxHp, a.def) === 2;
    switch (a.mode) {
      case 'hunt':
        a.shockIn -= dt;
        a.breathIn -= dt;
        if (a.breathIn <= 0) this.setMode(a, 'rise');
        else if (a.shockIn <= 0 && Phaser.Math.Distance.Between(f.x, f.y, p.x, p.y) < a.def.shock.radius * 1.6) {
          this.setMode(a, 'charge');
          f.playCelebrate(); // the crackling frames
          h.sfx('warn');
        }
        break;
      case 'charge':
        this.drawRing(a, a.t / a.def.shock.telegraph);
        if (a.t >= a.def.shock.telegraph) {
          this.zap(a, f.x, f.y, a.def.shock.radius, a.def.shock.hpFraction, a.def.shock.stunSeconds, 'ZAP!');
          a.shockIn = a.def.shock.every * (phase2 ? 0.7 : 1);
          this.setMode(a, 'hunt');
        }
        break;
      case 'rise':
        if (f.y < a.brain.air.y + f.size || a.t > a.def.breath.riseLimit) {
          this.setMode(a, 'gulp');
          a.leaped = false;
          h.sfx('gulp');
          h.popup('GULP! Bite it now!', f.x, f.y - f.size * 1.5, '#fee761');
        }
        break;
      case 'gulp':
        if (phase2 && !a.leaped && a.t > a.def.breath.gulp * 0.5) {
          // Like a real eel leaping at a threat at the surface: it shocks anyone near the air hole.
          a.leaped = true;
          f.playCelebrate();
          this.zap(a, a.brain.air.x, a.brain.air.y, a.def.leap.radius, a.def.leap.hpFraction, a.def.shock.stunSeconds, 'LEAP SHOCK!');
        }
        if (a.t >= a.def.breath.gulp) {
          a.breathIn = a.def.breath.every * (phase2 ? 0.8 : 1);
          this.setMode(a, 'hunt');
        }
        break;
    }
    if (a.mode !== 'charge') a.ring.clear();
  }

  private spawn(d: BossDef): void {
    const h = this.host;
    const sp = getSpecies(d.species);
    const cx = (d.left + d.right) / 2;
    const roof = h.ceilAt(cx), floor = h.groundAt(cx);
    const y = (roof + floor) / 2;
    const f = new Fish(h.scene, cx, y, sp, 1);
    let level = 1;
    while (level < 120 && f.size < h.player.size * d.sizeRatio) f.setLevel(++level);
    f.maxHp = Math.max(1, Math.round(h.player.biteDamage * (1 - (sp.armor ?? 0)) * d.hitsToDefeat));
    f.hp = f.maxHp;
    const home = new Phaser.Geom.Rectangle(d.left + 200, roof + 80, d.right - d.left - 400, Math.max(120, floor - roof - 200));
    const c: Creature = { fish: f, isPlayer: false, band: home, guardian: true, boss: d.id, guardRange: (d.right - d.left) / 2 };
    const brain = new BossBrain(c, h.world);
    brain.air = { x: d.airX, y: h.surfaceY + 30 };
    c.brain = brain;
    h.addCreature(f, c);
    const ring = h.scene.add.graphics().setDepth(7);
    this.active = { def: d, c, brain, mode: 'hunt', t: 0, shockIn: d.shock.every, breathIn: d.breath.every, leaped: false, introduced: false, ring };
  }

  private setMode(a: Active, m: BossMode): void {
    a.mode = m;
    a.brain.mode = m;
    a.t = 0;
  }

  /** The warning ring: grows to the shock's reach while it crackles. */
  private drawRing(a: Active, k: number): void {
    const f = a.c.fish;
    const g = a.ring;
    g.clear();
    const flicker = Math.floor(a.t * 12) % 2 === 0;
    g.lineStyle(6, 0xfee761, flicker ? 0.9 : 0.5);
    g.strokeCircle(f.x, f.y, a.def.shock.radius * Math.min(1, 0.35 + k * 0.65));
    g.lineStyle(2, 0xffffff, 0.6);
    g.strokeCircle(f.x, f.y, a.def.shock.radius);
  }

  /** A shock: a bright flash ring, and damage if the player is inside it. */
  private zap(a: Active, x: number, y: number, radius: number, hpFraction: number, stun: number, label: string): void {
    const h = this.host;
    const flash = h.scene.add.graphics().setDepth(7);
    flash.fillStyle(0xfee761, 0.35).fillCircle(x, y, radius);
    flash.lineStyle(8, 0xffffff, 0.9).strokeCircle(x, y, radius);
    h.scene.tweens.add({ targets: flash, alpha: 0, duration: 380, onComplete: () => flash.destroy() });
    h.sfx('zap');
    const p = h.player;
    if (!h.dead && Phaser.Math.Distance.Between(x, y, p.x, p.y) < radius + p.size * 0.5) h.hurtPlayer(a.c, hpFraction, stun, label);
  }

  /** The player lost to it: it is back at full health and calm, for the next try. */
  healFull(): void {
    const a = this.active;
    if (!a) return;
    a.c.fish.hp = a.c.fish.maxHp;
    this.setMode(a, 'hunt');
    a.shockIn = a.def.shock.every;
    a.breathIn = a.def.breath.every;
    a.ring.clear();
  }

  /** The boss died (GameScene.kill): reward and save happen in the host. */
  onKilled(c: Creature): void {
    if (!this.active || this.active.c !== c) return;
    const id = this.active.def.id;
    this.host.bossBar(null, 0, false);
    this.clear();
    this.host.defeated(id, c);
  }

  private clear(): void {
    this.active?.ring.destroy();
    this.active = null;
    this.host.bossBar(null, 0, false);
  }
}
