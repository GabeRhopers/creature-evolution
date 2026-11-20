import Phaser from 'phaser';
import type { Fish, SwimIntent } from './Fish';

/**
 * Placeholder AI for Sprint 1: the fish drifts toward a random point in its
 * depth band, then picks another. Sprint 3 replaces this with the full
 * Wander / Flee / Hunt / Eat / Rest state machine.
 */
export class WanderBrain {
  private tx = 0;
  private ty = 0;
  private timer = 0;

  constructor(
    private fish: Fish,
    private bounds: Phaser.Geom.Rectangle,
  ) {
    this.pickTarget();
  }

  think(dt: number): SwimIntent {
    this.timer -= dt;
    const dx = this.tx - this.fish.x;
    const dy = this.ty - this.fish.y;
    if (this.timer <= 0 || Math.hypot(dx, dy) < this.fish.size * 2) this.pickTarget();
    return { dirX: dx, dirY: dy, strength: 0.45, sprint: false };
  }

  private pickTarget(): void {
    const b = this.bounds;
    this.tx = Phaser.Math.Between(b.left, b.right);
    this.ty = Phaser.Math.Between(b.top, b.bottom);
    this.timer = Phaser.Math.FloatBetween(3, 8);
  }
}
