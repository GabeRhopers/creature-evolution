import Phaser from 'phaser';
import { PX, PX_FRAME_WIDTH } from '../systems/pixelTextures';
import { BALANCE } from '../data';

export interface FoodItem {
  img: Phaser.GameObjects.Image;
  /** Body radius in world px (for swallow checks). */
  size: number;
  xp: number;
  phase: number;
  driftX: number;
  alive: boolean;
  kind: 'plankton' | 'meat';
  /** Meat torn off a fish that is still alive: it does not fill the stomach. */
  scrap?: boolean;
  /** Seconds left before it disappears (plankton: Infinity). */
  life: number;
}

/**
 * Plankton field: small drifting food that keeps a steady count around the
 * camera. Items spawn just off-screen (so they never pop in view) and are
 * recycled when the camera leaves them far behind.
 * Meat chunks from bites go through `spawnMeat`: they sink slowly and expire.
 */
export class FoodField {
  readonly items: FoodItem[] = [];
  /** Time of day: more plankton at night (it rises to the surface), and it glows (0..1). */
  density = 1;
  glow = 0;
  private glowShown = -1;
  private pool: FoodItem[] = [];
  private tints: number[];
  private meatTint: number;

  constructor(
    private scene: Phaser.Scene,
    private swimArea: Phaser.Geom.Rectangle,
    /** Terrain: food never appears inside it, and sinking meat rests on the ground. */
    private terrain?: { isSolid(x: number, y: number, r?: number): boolean; groundAt(x: number): number },
  ) {
    this.tints = BALANCE.food.plankton.tints.map((h) => Phaser.Display.Color.HexStringToColor(h).color);
    this.meatTint = Phaser.Display.Color.HexStringToColor(BALANCE.combat.meatTint).color;
  }

  /** Fill the area around the camera right away (used at start). */
  fill(view: Phaser.Geom.Rectangle): void {
    const want = Math.round(BALANCE.food.plankton.targetCount * this.density);
    const area = this.spawnArea(view);
    let tries = 0;
    while (this.items.length < want && tries++ < want * 4) {
      const x = Phaser.Math.Between(area.left, area.right), y = Phaser.Math.Between(area.top, area.bottom);
      if (!this.terrain?.isSolid(x, y, 6)) this.spawnAt(x, y);
    }
  }

  spawnAt(x: number, y: number, size = BALANCE.food.plankton.size, xp = BALANCE.food.plankton.xp): FoodItem {
    let f = this.pool.pop();
    if (!f) {
      const img = this.scene.add.image(0, 0, PX, 'dot').setDepth(4);
      f = { img, size, xp, phase: 0, driftX: 0, alive: true, kind: 'plankton', life: Infinity };
    }
    f.size = size;
    f.xp = xp;
    f.alive = true;
    f.kind = 'plankton';
    f.scrap = false;
    f.life = Infinity;
    f.phase = Math.random() * Math.PI * 2;
    f.driftX = Phaser.Math.FloatBetween(-8, 8);
    // Pixel dot: its diameter on screen is 2 x size, as before.
    f.img
      .setPosition(x, y)
      .setFrame('dot')
      .setScale((size * 2) / PX_FRAME_WIDTH.dot)
      .setTint(Phaser.Utils.Array.GetRandom(this.tints))
      .setAlpha(0.95)
      .setBlendMode(this.glowShown === 1 ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
      .setVisible(true);
    this.items.push(f);
    return f;
  }

  /** A chunk of meat torn off by a bite. */
  spawnMeat(x: number, y: number, size: number, xp: number, scrap = false): FoodItem {
    const f = this.spawnAt(x, y, size, xp);
    f.kind = 'meat';
    f.scrap = scrap;
    f.life = BALANCE.combat.chunkLifeSeconds;
    f.driftX = Phaser.Math.FloatBetween(-25, 25);
    f.img.setFrame('chunk').setTint(this.meatTint).setScale((size * 2.4) / PX_FRAME_WIDTH.chunk).setBlendMode(Phaser.BlendModes.NORMAL);
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
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.img.x += f.driftX * dt;
      if (f.kind === 'meat') {
        f.driftX *= 0.98;
        f.img.y = Math.min(f.img.y + BALANCE.combat.chunkSinkSpeed * dt, this.swimArea.bottom, this.terrain ? this.terrain.groundAt(f.img.x) - 6 : Infinity);
        f.life -= dt;
        if (f.life < 3) f.img.setAlpha(Math.max(0, f.life / 3));
        if (f.life <= 0) this.remove(f);
      } else {
        f.img.y += Math.sin(time * 0.0012 + f.phase) * 6 * dt;
        // Night: plankton glows and twinkles (light adds up, like bioluminescence).
        if (this.glow > 0.02) f.img.setAlpha(0.55 + 0.45 * this.glow * (0.6 + 0.4 * Math.sin(time * 0.004 + f.phase * 3)));
      }
    }
    // Switch the blend mode only when the glow turns on or off (not every frame).
    const on = this.glow > 0.02 ? 1 : 0;
    if (on !== this.glowShown) {
      this.glowShown = on;
      for (const f of this.items) if (f.kind === 'plankton') f.img.setBlendMode(on ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL).setAlpha(0.95);
    }

    // Recycle food left far behind the camera.
    const keep = Phaser.Geom.Rectangle.Clone(view);
    Phaser.Geom.Rectangle.Inflate(keep, view.width * 1.2, view.height * 1.2);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      if (!keep.contains(f.img.x, f.img.y)) this.remove(f);
    }

    // Top up: spawn just outside the visible view so nothing pops in.
    const want = Math.round(BALANCE.food.plankton.targetCount * this.density);
    const area = this.spawnArea(view);
    let plankton = this.items.reduce((n, f) => n + (f.kind === 'plankton' ? 1 : 0), 0);
    let tries = 0;
    while (plankton < want && tries++ < 40) {
      const x = Phaser.Math.Between(area.left, area.right);
      const y = Phaser.Math.Between(area.top, area.bottom);
      if (!view.contains(x, y) && !this.terrain?.isSolid(x, y, 6)) {
        this.spawnAt(x, y);
        plankton++;
      }
    }
  }

  private spawnArea(view: Phaser.Geom.Rectangle): Phaser.Geom.Rectangle {
    const m = BALANCE.food.spawnMargin;
    const r = new Phaser.Geom.Rectangle(view.x - m, view.y - m, view.width + m * 2, view.height + m * 2);
    return Phaser.Geom.Rectangle.Intersection(r, this.swimArea);
  }
}
