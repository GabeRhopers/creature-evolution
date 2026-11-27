// The Fisher Ape (Rhopers, Nov 27; rules in src/systems/fisher.ts, `balance.json` "fisher", drawing
// public/studio/seeds/beast-fisher_ape.json from tools/fisher/). Sometimes, in daylight over the shallow regions, a monkey in a
// rowboat drifts in near the player and fishes: he casts, his line drops a hook, small fish that touch it are reeled up (he
// celebrates), and a hero that touches it is hooked: a small hit (never the last bit of health), and a hatchling or juvenile is
// pulled up toward the boat until it bites the line (EAT) or sprints free. An adult only gets stung (the line snaps). Ramming the
// boat from below or leaping into it scares him off (a little XP). The game draws the line, the bobber and the hook, so they
// reach any depth. One ape at a time; he leaves after a few catches or a minute.
import Phaser from 'phaser';
import { BALANCE } from '../data';
import type { Creature } from '../ai/Brain';
import type { Fish } from '../entities/Fish';
import type { SkinFrames } from '../skins';
import { makeFloat } from '../systems/sceneryArt';
import { canVisit, heroPulled, hookCatches, hookDamage, hookDepth, nextVisit, type FisherConfig, type FisherState } from '../systems/fisher';

export interface FisherHost {
  scene: Phaser.Scene;
  player(): Fish;
  playerCreature(): Creature;
  creatures(): Creature[];
  regionAt(x: number): string;
  period(): string;
  inArena(): boolean;
  /** A run is being played (not the home screen, not dead). */
  playing(): boolean;
  inWater(): boolean;
  eatHeld(): boolean;
  stageId(): string | undefined;
  surfaceY: number;
  seabedTop: number;
  look(): { key: string; frames: SkinFrames } | null;
  popup(text: string, x: number, y: number, big: boolean, color?: string): void;
  hurt(amount: number): void;
  caught(c: Creature): void;
  reward(xpShare: number): void;
  newCreature(name: string, intro: string): void;
  sfx: { stun(): void; splash(): void; levelUp(): void };
}

const WORLD_PX = 4;
const AUTOMATED = typeof navigator !== 'undefined' && !!(navigator as Navigator & { webdriver?: boolean }).webdriver;

export class FisherSystem {
  readonly cfg: FisherConfig;
  state: FisherState = 'away';
  /** Seconds until he may come again (while away), or left in the current step. */
  timer: number;
  /** Boat position (world x) and where he is heading. */
  x = 0;
  private targetX = 0;
  /** Which way he faces (+1 right, -1 left): the hook hangs on that side. */
  dir = 1;
  /** Which side he came from (he leaves the same way). */
  private side = 1;
  hookX = 0;
  hookY = 0;
  private hookTargetY = 0;
  catches = 0;
  hits = 0;
  private hitCooldown = 0;
  private stayT = 0;
  private swing = 0;
  hookedFish: Creature | null = null;
  hookedPlayer = false;
  private breakT = 0;
  private rehook = 0;
  private seen = false;
  private boat: Phaser.GameObjects.Image | null = null;
  private ape: Phaser.GameObjects.Image | null = null;
  private line: Phaser.GameObjects.Graphics | null = null;
  private animT = 0;
  /** Seconds since the hero was last swimming up fast (a ram counts for a moment, as the surface slows everyone down). */
  private risingT = 0;

  constructor(private host: FisherHost) {
    this.cfg = (BALANCE as unknown as { fisher: FisherConfig }).fisher;
    this.timer = this.cfg.firstAfter;
  }

  /** For tests and the dev tools: he comes right now, next to the player. */
  spawnNow(side?: number): void {
    this.cleanup();
    this.arrive(side ?? (Math.random() < 0.5 ? -1 : 1));
  }

  get here(): boolean {
    return this.state !== 'away';
  }

  update(dt: number): void {
    const h = this.host;
    const cfg = this.cfg;
    if (!h.playing()) {
      if (this.here && h.inArena()) this.cleanup();
      return;
    }
    const p = h.player();
    if (this.state === 'away') {
      // Automated test browsers never get a surprise visit (it would get in the way of other tests); spawnNow still works.
      if (AUTOMATED) return;
      if (!canVisit(cfg, h.regionAt(p.x), h.period(), h.inArena())) return;
      this.timer -= dt;
      if (this.timer <= 0) this.arrive(Math.random() < 0.5 ? -1 : 1);
      return;
    }
    // Too far away (the player wrapped around the sea, entered a cave, swam off): he is gone.
    if (Math.abs(this.x - p.x) > cfg.arriveDistance * 3 || h.inArena()) {
      this.cleanup();
      return;
    }
    this.stayT += dt;
    this.hitCooldown = Math.max(0, this.hitCooldown - dt);
    this.rehook = Math.max(0, this.rehook - dt);
    this.swing += dt;
    this.checkBoatHits(p, dt);
    if (!this.here) return;

    switch (this.state) {
      case 'arrive': {
        const d = this.targetX - this.x;
        const step = cfg.arriveSpeed * dt;
        if (Math.abs(d) <= step) {
          this.x = this.targetX;
          this.dir = p.x >= this.x ? 1 : -1;
          this.cast();
        } else this.x += Math.sign(d) * step;
        break;
      }
      case 'cast':
        this.timer -= dt;
        if (this.timer <= 0) this.drop();
        break;
      case 'drop':
        this.hookY = Math.min(this.hookTargetY, this.hookY + cfg.lineSpeed * dt);
        this.checkHook(p);
        if (this.state === 'drop' && this.hookY >= this.hookTargetY) {
          this.state = 'wait';
          this.timer = cfg.waitMin + Math.random() * (cfg.waitMax - cfg.waitMin);
        }
        break;
      case 'wait':
        this.checkHook(p);
        if (this.state !== 'wait') break;
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'reel';
        break;
      case 'reel':
        this.reel(p, dt);
        break;
      case 'catch':
        this.timer -= dt;
        if (this.timer <= 0) this.next();
        break;
      case 'leave':
        this.x += this.side * cfg.leaveSpeed * dt;
        if (Math.abs(this.x - p.x) > cfg.arriveDistance + 400) this.cleanup();
        break;
    }
    if (this.state !== 'drop' && this.state !== 'wait' && this.state !== 'reel') this.hookY = this.host.surfaceY - 30;
    this.draw(dt);
  }

  // ---------------------------------------------------------------- steps

  private arrive(side: number): void {
    const p = this.host.player();
    this.side = side;
    this.x = p.x + side * this.cfg.arriveDistance;
    this.targetX = p.x + side * 260;
    this.dir = -side;
    this.state = 'arrive';
    this.catches = 0;
    this.hits = 0;
    this.stayT = 0;
    this.hookedFish = null;
    this.hookedPlayer = false;
    this.hookY = this.host.surfaceY - 30;
    this.build();
    if (!this.seen) {
      this.seen = true;
      this.host.newCreature('Fisher Ape', 'A monkey fishing from a boat. Keep away from his hook, or ram the boat to scare him off!');
    }
  }

  private cast(): void {
    this.state = 'cast';
    this.timer = this.cfg.castSeconds;
  }

  private drop(): void {
    const h = this.host;
    const cfg = this.cfg;
    this.state = 'drop';
    this.hookX = this.castX();
    this.hookY = h.surfaceY;
    // Aim at the depth of a small fish near the line, if there is one; otherwise somewhere in the shallow water.
    const lo = hookDepth(cfg, h.surfaceY, h.seabedTop, 0), hi = hookDepth(cfg, h.surfaceY, h.seabedTop, 1);
    const fish = h.creatures().find((c) => !c.isPlayer && c.brain && !c.asleep && hookCatches(cfg, c.fish.size) && Math.abs(c.fish.x - this.hookX) < 400 && c.fish.y > lo && c.fish.y < hi);
    this.hookTargetY = fish ? fish.fish.y : hookDepth(cfg, h.surfaceY, h.seabedTop, Math.random());
  }

  /** After a catch or an empty reel: cast again, or row away when done. */
  private next(): void {
    if (this.catches >= this.cfg.catches || this.stayT >= this.cfg.stay) this.leave();
    else this.cast();
  }

  private leave(): void {
    this.releaseFish();
    this.hookedPlayer = false;
    this.state = 'leave';
    this.dir = this.side;
  }

  private checkHook(p: Fish): void {
    const h = this.host;
    const cfg = this.cfg;
    // The hero.
    if (this.rehook <= 0 && h.inWater() && Phaser.Math.Distance.Between(p.x, p.y, this.hookX, this.hookY) < cfg.hookRadius + p.size * 0.6) {
      const dmg = hookDamage(cfg, p.hp, p.maxHp);
      if (dmg > 0) h.hurt(dmg);
      h.popup('HOOKED!', p.x, p.y - p.size * 1.4, true, '#ff9a8a');
      if (heroPulled(cfg, h.stageId())) {
        this.hookedPlayer = true;
        this.breakT = 0;
      } else {
        // Too big to pull: the line snaps.
        h.popup('Snap!', this.hookX, this.hookY - 20, false, '#cfe8ff');
        this.rehook = cfg.rehookSeconds;
      }
      this.state = 'reel';
      return;
    }
    // A small fish.
    for (const c of h.creatures()) {
      if (c.isPlayer || !c.brain || c.asleep || c.guardian || c.boss || c.fish.species.friendly || !c.fish.active) continue;
      if (!hookCatches(cfg, c.fish.size)) continue;
      if (Phaser.Math.Distance.Between(c.fish.x, c.fish.y, this.hookX, this.hookY) < cfg.hookRadius + c.fish.size * 0.5) {
        this.hookedFish = c;
        this.state = 'reel';
        return;
      }
    }
  }

  private reel(p: Fish, dt: number): void {
    const h = this.host;
    const cfg = this.cfg;
    const speed = this.hookedPlayer ? cfg.pullSpeed : cfg.reelSpeed;
    this.hookY -= speed * dt;
    if (this.hookedFish) {
      const f = this.hookedFish.fish;
      if (!f.active || this.hookedFish.asleep) this.hookedFish = null;
      else {
        f.stun(0.5);
        f.setPosition(this.hookX, this.hookY + f.size * 0.6);
        f.arcadeBody.setVelocity(0, 0);
      }
    }
    if (this.hookedPlayer) {
      // Pulled toward the hook; biting the line (EAT) or sprinting free lets go.
      p.arcadeBody.setVelocity((this.hookX - p.x) * 4, (this.hookY + p.size * 0.6 - p.y) * 4);
      if ((p as Fish & { isSprinting?: boolean }).isSprinting) this.breakT += dt;
      if (h.eatHeld() || this.breakT >= cfg.breakSprintSeconds) {
        this.hookedPlayer = false;
        this.rehook = cfg.rehookSeconds;
        h.popup('Free!', p.x, p.y - p.size * 1.4, false, '#b6f0a8');
      }
    }
    if (this.hookY > h.surfaceY) return;
    // Out of the water.
    if (this.hookedPlayer) {
      // Swung against the boat: another small hit, then dropped back in.
      const dmg = hookDamage(cfg, p.hp, p.maxHp);
      if (dmg > 0) h.hurt(dmg);
      this.hookedPlayer = false;
      this.rehook = cfg.rehookSeconds;
      p.arcadeBody.setVelocity(this.dir * 200, 260);
      h.sfx.splash();
      this.next();
      return;
    }
    if (this.hookedFish) {
      const c = this.hookedFish;
      this.hookedFish = null;
      this.catches++;
      h.caught(c);
      h.sfx.splash();
      this.state = 'catch';
      this.timer = cfg.catchSeconds;
      this.animT = 0;
      return;
    }
    this.next();
  }

  private releaseFish(): void {
    if (this.hookedFish) this.hookedFish.fish.stun(0.3);
    this.hookedFish = null;
  }

  /** Ramming the boat from below, or landing in it from a leap. */
  private checkBoatHits(p: Fish, dt: number): void {
    const h = this.host;
    const cfg = this.cfg;
    this.risingT = p.lastVy < -p.cruiseSpeed * cfg.boatHitSpeedRatio ? 0.35 : Math.max(0, this.risingT - dt);
    if (this.state === 'leave' || this.hitCooldown > 0) return;
    const half = (36 * WORLD_PX) / 2;
    if (Math.abs(p.x - this.x) > half + p.size * 0.5) return;
    const nearSurface = p.y > h.surfaceY - 80 && p.y < h.surfaceY + p.size * 2.5 + 40;
    const rising = this.risingT > 0;
    if (!nearSurface || !(rising || !h.inWater())) return;
    this.hits++;
    this.hitCooldown = cfg.boatHitCooldown;
    h.sfx.stun();
    h.popup(this.hits >= cfg.boatHitsToScare ? 'Scared off!' : 'Bonk!', this.x, h.surfaceY - 120, true, '#fee761');
    if (this.boat) this.host.scene.tweens.add({ targets: this.boat, angle: { from: -10, to: 0 }, duration: 300, ease: 'Back.easeOut' });
    this.hookedPlayer = false;
    if (this.hits >= cfg.boatHitsToScare) {
      h.reward(cfg.scareXpShare);
      this.leave();
    }
  }

  // ---------------------------------------------------------------- drawing

  private build(): void {
    const s = this.host.scene;
    makeFloat(s, 'w_float_rowboat', 'rowboat');
    this.boat = s.add.image(this.x, this.host.surfaceY - 2, 'w_float_rowboat').setScale(WORLD_PX).setDepth(9);
    const look = this.host.look();
    if (look) this.ape = s.add.image(this.x, this.host.surfaceY + 6, look.key, look.frames.idle?.[0] ?? look.frames.swim[0]).setOrigin(0.5, 1).setScale(this.cfg.artScale).setDepth(8);
    this.line = s.add.graphics().setDepth(7);
  }

  private cleanup(): void {
    this.releaseFish();
    this.hookedPlayer = false;
    this.boat?.destroy();
    this.ape?.destroy();
    this.line?.destroy();
    this.boat = this.ape = null;
    this.line = null;
    this.state = 'away';
    this.timer = nextVisit(this.cfg, Math.random());
  }

  /** The rod's tip in the world (the drawings hold the rod up on the side they face). */
  rodTip(): { x: number; y: number } {
    const s = this.cfg.artScale;
    return { x: this.x + this.dir * 14 * s, y: this.host.surfaceY + 6 - 40 * s };
  }

  /** Where the line goes into the water: out past the boat's end, on the side he faces. */
  private castX(): number {
    return this.x + this.dir * (18 * WORLD_PX + 40);
  }

  private draw(dt: number): void {
    const h = this.host;
    const bob = Math.sin(this.swing * 2.2) * 3;
    this.boat?.setPosition(this.x, h.surfaceY - 2 + bob).setFlipX(this.dir < 0);
    if (this.ape) {
      this.ape.setPosition(this.x, h.surfaceY + 6 + bob).setFlipX(this.dir < 0);
      const look = h.look();
      if (look) {
        this.animT += dt;
        const f = look.frames;
        const idle = f.idle?.length ? f.idle : f.swim;
        const seq = f.biteSeq ?? [];
        let frame = idle[Math.floor(this.animT * 3) % idle.length];
        if (this.state === 'cast') frame = seq[0] ?? frame;
        else if (this.state === 'reel') frame = seq[1] ?? f.damage ?? frame;
        else if (this.state === 'catch' && f.celebrate?.length) frame = f.celebrate[Math.floor(this.animT * 4) % f.celebrate.length];
        if (this.ape.frame.name !== frame) this.ape.setFrame(frame);
      }
    }
    const g = this.line;
    if (!g) return;
    g.clear();
    if (this.state !== 'drop' && this.state !== 'wait' && this.state !== 'reel') return;
    const tip = this.rodTip();
    tip.y += bob;
    // Swing a little while waiting.
    if (this.state === 'wait') this.hookX = this.castX() + Math.sin(this.swing * 1.3) * this.cfg.hookSwing;
    g.lineStyle(2, 0xe8e8e8, 0.85);
    g.beginPath();
    g.moveTo(tip.x, tip.y);
    g.lineTo(this.hookX, Math.max(h.surfaceY, Math.min(this.hookY, h.surfaceY + 4)));
    g.lineTo(this.hookX, this.hookY);
    g.strokePath();
    // The bobber floats on the surface, the hook hangs at the end.
    g.fillStyle(0xe43b44, 1).fillCircle(this.hookX, h.surfaceY + 2, 7);
    g.fillStyle(0xffffff, 1).fillRect(this.hookX - 7, h.surfaceY - 5, 14, 5);
    g.lineStyle(4, 0xc0cbdc, 1);
    g.beginPath();
    g.arc(this.hookX + 6, this.hookY, 7, Math.PI * 0.1, Math.PI * 1.1, false);
    g.strokePath();
    g.lineStyle(4, 0xc0cbdc, 1).lineBetween(this.hookX, this.hookY - 14, this.hookX, this.hookY);
  }
}
