import Phaser from 'phaser';
import { ATLAS } from '../assets';
import { BALANCE } from '../data';

export interface FoodItem {
  img: Phaser.GameObjects.Image;
  /** Body radius in world px (for swallow checks). */
  size: number;
  xp: number;
  phase: number;
  driftX: number;
  alive: boolean;
}

/**
 * Plankton field: small drifting food that keeps a steady count around the
 * camera. Items spawn just off-screen (so they never pop in view) and are
 * recycled when the camera leaves them far behind.
 * Sprint 4 adds meat chunks from bites through the same `spawnAt` path.
 */
export class FoodField {
  readonly items: FoodItem[] = [];
  private pool: FoodItem[] = [];
  private tints: number[];

  constructor(
    private scene: Phaser.Scene,
    private swimArea: Phaser.Geom.Rectangle,
  ) {
    this.tints = BALANCE.food.plankton.tints.map((h) => Phaser.Display.Color.HexStringToColor(h).color);
  }

  /** Fill the area around the camera right away (used at start). */
  fill(view: Phaser.Geom.Rectangle): void {
    const want = BALANCE.food.plankton.targetCount;
    const area = this.spawnArea(view);
    while (this.items.length < want) {
      this.spawnAt(Phaser.Math.Between(area.left, area.right), Phaser.Math.Between(area.top, area.bottom));
    }
  }

  spawnAt(x: number, y: number, size = BALANCE.food.plankton.size, xp = BALANCE.food.plankton.xp): FoodItem {
    let f = this.pool.pop();
    if (!f) {
      const img = this.scene.add.image(0, 0, ATLAS, 'bubble_b').setDepth(4);
      f = { img, size, xp, phase: 0, driftX: 0, alive: true };
    }
    f.size = size;
    f.xp = xp;
    f.alive = true;
    f.phase = Math.random() * Math.PI * 2;
    f.driftX = Phaser.Math.FloatBetween(-8, 8);
    // bubble_b's dot is ~24px wide in its 128px frame.
    f.img
      .setPosition(x, y)
      .setScale((size * 2) / 24)
      .setTint(Phaser.Utils.Array.GetRandom(this.tints))
      .setAlpha(0.95)
      .setVisible(true);
    this.items.push(f);
    return f;
  }

  remove(f: FoodItem): void {
    if (!f.alive) return;
    f.alive = false;
    f.img.setVisible(false);
    const i = this.items.indexOf(f);
    if (i >= 0) this.items.splice(i, 1);
    this.pool.push(f);
  }

  update(dt: number, view: Phaser.Geom.Rectangle, time: number): void {
    // Drift and gentle bobbing.
    for (const f of this.items) {
      f.img.x += f.driftX * dt;
      f.img.y += Math.sin(time * 0.0012 + f.phase) * 6 * dt;
    }

    // Recycle food left far behind the camera.
    const keep = Phaser.Geom.Rectangle.Clone(view);
    Phaser.Geom.Rectangle.Inflate(keep, view.width * 1.2, view.height * 1.2);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      if (!keep.contains(f.img.x, f.img.y)) this.remove(f);
    }

    // Top up: spawn just outside the visible view so nothing pops in.
    const want = BALANCE.food.plankton.targetCount;
    const area = this.spawnArea(view);
    let tries = 0;
    while (this.items.length < want && tries++ < 40) {
      const x = Phaser.Math.Between(area.left, area.right);
      const y = Phaser.Math.Between(area.top, area.bottom);
      if (!view.contains(x, y)) this.spawnAt(x, y);
    }
  }

  private spawnArea(view: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const m = BALANCE.food.spawnMargin;
    const r = new Phaser.Geom.Rectangle(view.x - m, view.y - m, view.width + m * 2, view.height + m * 2);
    return Phaser.Geom.Rectangle.Intersection(r, this.swimArea);
  }
}
