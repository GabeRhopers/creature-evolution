import Phaser from 'phaser';
import { PX, PX_FRAME_WIDTH } from './pixelTextures';

interface Bubble {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  startScale: number;
  startAlpha: number;
}

/**
 * Lightweight pooled bubbles made of plain Images.
 *
 * Plain images from the pixel-effects texture (see pixelTextures.ts) and
 * give full control (wobble, fade) for about the same cost as an emitter.
 */
export class Bubbles {
  private pool: Bubble[] = [];
  private live: Bubble[] = [];

  /** Callers give scales for the old 24 px bubble; pixel frames are much smaller. */
  private scaleMul: number;

  constructor(private scene: Phaser.Scene, private frame: string, private depth: number) {
    this.scaleMul = 24 / (PX_FRAME_WIDTH[frame] ?? 24);
  }

  spawn(x: number, y: number, opts: { vx?: number; vy: number; life: number; scale: number; alpha: number }): void {
    let b = this.pool.pop();
    if (!b) {
      const img = this.scene.add.image(0, 0, PX, this.frame).setDepth(this.depth);
      b = { img, vx: 0, vy: 0, life: 0, maxLife: 1, startScale: 1, startAlpha: 1 };
    }
    b.img.setPosition(x, y).setScale(opts.scale * this.scaleMul).setAlpha(opts.alpha).setVisible(true);
    b.vx = opts.vx ?? 0;
    b.vy = opts.vy;
    b.life = opts.life;
    b.maxLife = opts.life;
    b.startScale = opts.scale;
    b.startAlpha = opts.alpha;
    this.live.push(b);
  }

  update(dt: number, topY: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.life -= dt;
      b.img.x += (b.vx + Math.sin((b.maxLife - b.life) * 3 + b.img.y * 0.01) * 6) * dt;
      b.img.y += b.vy * dt;
      const t = Math.max(0, b.life / b.maxLife);
      b.img.setAlpha(b.startAlpha * t);
      if (b.life <= 0 || b.img.y < topY) {
        b.img.setVisible(false);
        this.live.splice(i, 1);
        this.pool.push(b);
      }
    }
  }

  get count(): number {
    return this.live.length;
  }
}
