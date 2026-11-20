import Phaser from 'phaser';
import { BALANCE, type Species } from '../data';
import { ATLAS } from '../assets';
import { sizeAt, speedFactor, turnFactor, maxHpAt, devourSizeAt } from '../systems/growth';

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
// around the frame center. Scaling the sprite by size/ART_RADIUS makes the
// visible fish match the physics circle.
const ART_RADIUS = 36;
const FRAME_CENTER = 64;

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
  private sinceSprint = 99;

  constructor(scene: Phaser.Scene, x: number, y: number, species: Species, level = 1) {
    super(scene, x, y, ATLAS, species.sprite);
    this.species = species;
    this.stamina = BALANCE.stamina.max;
    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(ART_RADIUS, FRAME_CENTER - ART_RADIUS, FRAME_CENTER - ART_RADIUS);
    body.setCollideWorldBounds(true);
    body.setAllowGravity(false);

    this.heading = Math.random() < 0.5 ? 0 : Math.PI;
    this.setLevel(level);
    this.hp = this.maxHp;
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

  setLevel(level: number): void {
    const hpRatio = this.maxHp > 1 ? this.hp / this.maxHp : 1;
    this.level = Math.max(1, level);
    this.size = sizeAt(this.species, this.level);
    this.maxHp = maxHpAt(this.species, this.level);
    this.hp = Math.max(1, Math.round(this.maxHp * hpRatio));
    this.setScale(this.size / ART_RADIUS);
  }

  /** Advance swimming physics by dt seconds. */
  swim(intent: SwimIntent, dt: number): void {
    const sp = this.species;
    const st = BALANCE.stamina;
    const body = this.arcadeBody;

    const len = Math.hypot(intent.dirX, intent.dirY);
    const thrust = len > 0.0001 ? Phaser.Math.Clamp(intent.strength, 0, 1) : 0;

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
    const maxSpeed = sp.maxSpeed * speedFactor(sp, this.level) * sprintMul;
    const accel = sp.accel * speedFactor(sp, this.level) * (this.isSprinting ? 1.6 : 1);

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
    this.updateVisual(dt);
  }

  /** Point the sprite along the heading; flip so the fish is never upside down. */
  private updateVisual(dt: number): void {
    const facingLeft = Math.cos(this.heading) < 0;
    this.setFlipY(facingLeft);
    // Smooth the visual rotation a little more than the physics heading.
    this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, this.heading, 14 * dt);
  }
}
