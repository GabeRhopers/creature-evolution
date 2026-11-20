import Phaser from 'phaser';
import { BALANCE, type Species } from '../data';
import { ATLAS } from '../assets';
import { sizeAt, speedFactor, turnFactor, maxHpAt, devourSizeAt, xpToNext, biteDamageAt } from '../systems/growth';

/** What a controller (keyboard, touch or AI brain) asks the fish to do this frame. */
export interface SwimIntent {
  /** Desired swim direction. Need not be normalized. null = no input (coast). */
  dirX: number;
  dirY: number;
  /** 0..1 how hard to swim (touch distance, stick tilt). */
  strength: number;
  sprint: boolean;
}

export const NO_INTENT: SwimIntent = { dirX: 0, dirY: 0, strength: 0, sprint: false };

// Kenney fish art: 128x128 frame, the fish body fits a circle of ~36px radius
// around the frame center. Scaling the sprite by size/artRadius makes the
// visible fish match the physics circle. Species can override this with `art`
// (e.g. the long crocodile frames).
const DEFAULT_ART_RADIUS = 36;

/**
 * A swimming creature. Shared by the player and every AI fish:
 * only the controller that produces the SwimIntent differs.
 *
 * Movement model (side view, no gravity):
 *  - The fish has a heading and can only turn at turnSpeed rad/s.
 *  - Thrust accelerates it along its heading, not instantly toward the input.
 *  - Drag bleeds speed every frame, so it coasts and glides (momentum).
 *  - Sprint raises max speed and acceleration and drains stamina.
 */
export class Fish extends Phaser.Physics.Arcade.Sprite {
  species: Species;
  level = 1;
  size = 1;
  hp = 1;
  maxHp = 1;
  heading = 0;
  stamina: number;
  isSprinting = false;
  exhausted = false;
  /** XP collected toward the next level. */
  xp = 0;
  /** Difficulty multiplier on swim speed (AI only; player stays 1). */
  speedMul = 1;
  /** Seconds left stunned (no steering or thrust). */
  stunTimer = 0;
  /** Seconds left in an active Dash. */
  dashTimer = 0;
  /** Seconds until Dash can be used again. */
  dashCooldown = 0;
  /** Seconds until the next bite is allowed. */
  biteCooldown = 0;
  /** Seconds since this fish last took damage (drives regen). */
  sinceHurt = 99;
  /** Seconds of post-hit invulnerability left (player only). */
  invulnTimer = 0;
  /** Speed at the end of last frame (before collisions changed it): used for ram checks. */
  lastSpeed = 0;
  private baseTint = 0xffffff;
  /** Seconds left showing the bite / open-jaw frame. */
  private biteAnim = 0;
  private celebrateAnim = 0;
  /** Frames from a Sprite Studio drawing, replacing the species art (player only). */
  private skinFrames: NonNullable<NonNullable<Species['art']>['frames']> | null = null;
  private animClock = 0;
  private idleClock = 0;
  /** Set by GameScene while the player is digesting (lie flat). */
  digestPose = false;
  private sinceSprint = 99;

  constructor(scene: Phaser.Scene, x: number, y: number, species: Species, level = 1) {
    super(scene, x, y, ATLAS, species.sprite);
    this.species = species;
    this.stamina = BALANCE.stamina.max;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const r = this.artRadius;
    body.setCircle(r, this.frame.realWidth / 2 - r, this.frame.realHeight / 2 - r);
    body.setCollideWorldBounds(true);
    body.setAllowGravity(false);

    this.heading = Math.random() < 0.5 ? 0 : Math.PI;
    this.setLevel(level);
    this.hp = this.maxHp;
  }

  get artRadius(): number {
    return this.species.art?.radius ?? DEFAULT_ART_RADIUS;
  }

  /** Show the open-jaw frame briefly (species with animation frames). */
  playBite(): void {
    this.biteAnim = 0.25;
  }

  /** Play the celebrate animation (level-up), if the art has one. */
  playCelebrate(): void {
    this.celebrateAnim = 1.1;
  }

  /** Use frames from another texture (a Sprite Studio drawing). Same frame size as the original art. */
  applySkin(texture: string, frames: { swim: string[]; idle?: string[]; bite?: string; rest?: string; damage?: string; celebrate?: string[] }): void {
    if (!frames.swim.length) return;
    this.skinFrames = { ...frames, celebrate: frames.celebrate?.length ? frames.celebrate : undefined };
    this.setTexture(texture, frames.swim[0]);
  }

  get arcadeBody(): Phaser.Physics.Arcade.Body {
    return this.body as Phaser.Physics.Arcade.Body;
  }

  get speed(): number {
    return this.arcadeBody.velocity.length();
  }

  get devourSize(): number {
    return devourSizeAt(this.species, this.level);
  }

  get xpNeeded(): number {
    return xpToNext(this.level);
  }

  /** Center of the mouth area in world space (just ahead of the head). */
  mouthPoint(): Phaser.Math.Vector2 {
    const reach = this.size * (this.species.art?.mouthReach ?? BALANCE.eating.mouthReach);
    return new Phaser.Math.Vector2(this.x + Math.cos(this.heading) * reach, this.y + Math.sin(this.heading) * reach);
  }

  /** Radius of the mouth area; `suction` widens it while actively swallowing. */
  mouthRadius(suction = false): number {
    const e = BALANCE.eating;
    return this.size * ((this.species.art?.mouthRadius ?? e.mouthRadius) + (suction ? e.suctionBonus : 0));
  }

  /** Can this fish swallow something of the given body radius whole? */
  canSwallow(targetSize: number): boolean {
    return targetSize <= this.devourSize;
  }

  /** Add XP, level up as many times as earned. Returns levels gained. */
  addXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      gained++;
      this.setLevel(this.level + 1);
    }
    return gained;
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  get biteDamage(): number {
    return biteDamageAt(this.species, this.level);
  }

  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  get dashing(): boolean {
    return this.dashTimer > 0;
  }

  /** Below 30% HP: slow, tilted, and attracts predators. */
  get wounded(): boolean {
    return this.hp < this.maxHp * BALANCE.combat.woundedBelow;
  }

  /** Normal top speed right now (no sprint), used as the ramming reference. */
  get cruiseSpeed(): number {
    return this.species.maxSpeed * speedFactor(this.species, this.level) * this.speedMul;
  }

  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  get invulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  /** Damage after this species' armor (thick hide). */
  armored(amount: number): number {
    return amount * (1 - (this.species.armor ?? 0));
  }

  /**
   * Apply damage (armor already applied by the caller via `armored`).
   * Returns true if this hit killed the fish. Big hits stun (critical wound)
   * unless `critStun` is false.
   */
  takeDamage(amount: number, critStun = true): boolean {
    const c = BALANCE.combat;
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHurt = 0;
    if (critStun && amount >= this.maxHp * c.critFraction) this.stun(c.critStunSeconds);
    // Hit flash.
    this.setTint(0xff7070);
    this.scene.time.delayedCall(120, () => this.active && this.setTint(this.baseTint));
    return this.hp <= 0;
  }

  /** Lunge forward. Returns false if on cooldown, stunned or out of stamina. */
  tryDash(): boolean {
    const d = BALANCE.combat.dash;
    if (this.dashCooldown > 0 || this.stunned || this.stamina < d.staminaCost) return false;
    this.stamina -= d.staminaCost;
    this.dashTimer = d.durationSeconds;
    this.dashCooldown = d.cooldownSeconds;
    const v = this.cruiseSpeed * d.speedMul;
    this.arcadeBody.setVelocity(Math.cos(this.heading) * v, Math.sin(this.heading) * v);
    return true;
  }

  /** Reset combat state (used when an AI fish respawns). */
  resetCombat(): void {
    this.hp = this.maxHp;
    this.stunTimer = 0;
    this.dashTimer = 0;
    this.sinceHurt = 99;
    this.setTint(this.baseTint);
  }

  setLevel(level: number): void {
    const hpRatio = this.maxHp > 1 ? this.hp / this.maxHp : 1;
    this.level = Math.max(1, level);
    this.size = sizeAt(this.species, this.level);
    this.maxHp = maxHpAt(this.species, this.level);
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.setScale(this.size / this.artRadius);
  }

  /** Advance swimming physics by dt seconds. */
  swim(intent: SwimIntent, dt: number): void {
    const sp = this.species;
    const st = BALANCE.stamina;
    const body = this.arcadeBody;

    const c = BALANCE.combat;
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.sinceHurt += dt;
    // Slow regeneration when out of combat for a while.
    if (this.sinceHurt > c.regenDelaySeconds && this.hp < this.maxHp) this.heal(this.maxHp * c.regenPerSecond * dt);

    const len = Math.hypot(intent.dirX, intent.dirY);
    const thrust = len > 0.0001 && !this.stunned ? Phaser.Math.Clamp(intent.strength, 0, 1) : 0;

    // Animated species settle to horizontal when idle, so the idle pose and
    // the mouth both face sideways.
    if (thrust === 0 && sp.art?.frames?.idle && body.velocity.length() < this.cruiseSpeed * 0.12) {
      const side = Math.cos(this.heading) < 0 ? Math.PI : 0;
      this.heading = Phaser.Math.Angle.RotateTo(this.heading, side, sp.turnSpeed * 0.5 * dt);
    }

    // Turning: rotate heading toward the requested direction at a limited rate.
    if (thrust > 0) {
      const target = Math.atan2(intent.dirY, intent.dirX);
      const maxTurn = sp.turnSpeed * turnFactor(sp, this.level) * dt;
      this.heading = Phaser.Math.Angle.RotateTo(this.heading, target, maxTurn);
    }

    // Stamina and sprint.
    if (this.exhausted && this.stamina >= st.exhaustedThreshold) this.exhausted = false;
    this.isSprinting = intent.sprint && thrust > 0 && !this.exhausted && this.stamina > 0;
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - st.drainPerSecond * dt);
      this.sinceSprint = 0;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.sinceSprint += dt;
      if (this.sinceSprint >= st.regenDelay) {
        this.stamina = Math.min(st.max, this.stamina + st.regenPerSecond * dt);
      }
    }

    const sprintMul = this.isSprinting ? sp.sprintMultiplier : 1;
    const woundMul = this.wounded ? c.woundedSpeedMul : 1;
    // While dashing, the cap is the dash speed so the lunge is not clipped.
    const dashMul = this.dashing ? c.dash.speedMul : 1;
    const maxSpeed = sp.maxSpeed * speedFactor(sp, this.level) * Math.max(sprintMul * woundMul, dashMul) * this.speedMul;
    const accel = sp.accel * speedFactor(sp, this.level) * (this.isSprinting ? 1.6 : 1) * this.speedMul;

    let vx = body.velocity.x;
    let vy = body.velocity.y;

    // Thrust along the heading. Swimming hard while still facing away from
    // the input (mid-turn) gives less push, which reads as a natural U-turn.
    if (thrust > 0) {
      const target = Math.atan2(intent.dirY, intent.dirX);
      const misalign = Math.abs(Phaser.Math.Angle.Wrap(target - this.heading));
      const alignFactor = Phaser.Math.Clamp(1 - misalign / Math.PI, 0.25, 1);
      vx += Math.cos(this.heading) * accel * thrust * alignFactor * dt;
      vy += Math.sin(this.heading) * accel * thrust * alignFactor * dt;
    }

    // Water drag, frame-rate independent.
    const dragK = Math.pow(sp.drag, dt * 60);
    vx *= dragK;
    vy *= dragK;

    // Soft speed cap: above max, bleed quickly instead of a hard clamp,
    // so ending a sprint glides down rather than snapping.
    const spd = Math.hypot(vx, vy);
    if (spd > maxSpeed) {
      const k = Phaser.Math.Linear(spd, maxSpeed, Math.min(1, 6 * dt)) / spd;
      vx *= k;
      vy *= k;
    }

    // Keep fish under the surface: gentle push down near the top.
    const surfaceY = BALANCE.world.surfaceY;
    if (this.y - this.size < surfaceY + 4) vy += BALANCE.surface.pushDown * dt;

    body.setVelocity(vx, vy);
    // Speed we asked for, before the next physics step's collisions change it.
    this.lastSpeed = Math.hypot(vx, vy);
    this.updateVisual(dt);
  }

  /** Point the sprite along the heading; flip so the fish is never upside down. */
  private updateVisual(dt: number): void {
    const facingLeft = Math.cos(this.heading) < 0;
    this.setFlipY(facingLeft);
    // Wounded fish list toward belly-up; stunned fish wobble.
    let target = this.heading;
    if (this.wounded) target += (facingLeft ? -1 : 1) * 0.7;
    if (this.stunned) target += Math.sin(this.scene.time.now / 50) * 0.35;
    // Smooth the visual rotation a little more than the physics heading.
    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, target, 14 * dt);
    // Blink while invulnerable after a hit; wobble-fade while stunned.
    const blink = this.invulnerable && Math.floor(this.scene.time.now / 80) % 2 === 0;
    this.setAlpha(blink ? 0.35 : this.stunned ? 0.75 + 0.25 * Math.sin(this.scene.time.now / 60) : 1);
    this.animate(dt);
  }

  /** Frame animation for species that have it: swim, bite, idle, rest. */
  private animate(dt: number): void {
    const frames = this.skinFrames ?? this.species.art?.frames;
    if (!frames) return;
    this.biteAnim = Math.max(0, this.biteAnim - dt);
    this.celebrateAnim = Math.max(0, this.celebrateAnim - dt);
    let frame: string;
    const speed = this.arcadeBody.velocity.length();
    const still = speed < this.cruiseSpeed * 0.12 && !this.stunned;
    if (this.biteAnim > 0 && frames.bite) {
      frame = frames.bite;
    } else if (this.sinceHurt < 0.35 && frames.damage) {
      frame = frames.damage;
    } else if (this.celebrateAnim > 0 && frames.celebrate) {
      frame = frames.celebrate[Math.floor((1.1 - this.celebrateAnim) * 8) % frames.celebrate.length];
    } else if (still && this.digestPose && frames.rest) {
      // Lying flat while digesting.
      frame = frames.rest;
    } else if (still && frames.idle) {
      // Gentle idle loop: tail sway + tongue flick, with a blink every few seconds.
      this.idleClock += dt;
      const blinkPhase = this.idleClock % 3.4;
      if (frames.blink && blinkPhase > 3.25) frame = frames.blink;
      else frame = frames.idle[Math.floor(this.idleClock * 1.6) % frames.idle.length];
    } else if (still && frames.rest) {
      frame = frames.rest;
    } else {
      this.idleClock = 0;
      // Paddle faster the faster we swim.
      this.animClock += dt * (2 + (speed / this.cruiseSpeed) * 6);
      frame = frames.swim[Math.floor(this.animClock) % frames.swim.length];
    }
    if (this.frame.name !== frame) this.setFrame(frame, false, false);
  }
}
