import Phaser from 'phaser';
import type { GameScene } from './GameScene';

/**
 * Light over the world, under the HUD: the water tint of the time of day (warm at dawn, purple at
 * dusk, deep blue at night) and the darkness that closes in around the player at night.
 * Runs between the Game and Hud scenes, with its own camera (no zoom, no scroll), so it is
 * screen-sized whatever the game camera does.
 */
export class LightScene extends Phaser.Scene {
  private tint!: Phaser.GameObjects.Rectangle;
  private dark!: Phaser.GameObjects.Image;
  /** Glowing plankton, drawn above the darkness so it shines in the night (bioluminescence). */
  private glows: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('Light');
  }

  create(): void {
    if (!this.textures.exists('light_hole')) this.makeHole();
    if (!this.textures.exists('light_dot')) {
      const c = document.createElement('canvas');
      c.width = 32;
      c.height = 32;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(16, 16, 1, 16, 16, 16);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 32, 32);
      this.textures.addCanvas('light_dot', c);
    }
    this.glows = [];
    this.tint = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setOrigin(0, 0);
    this.dark = this.add.image(0, 0, 'light_hole').setAlpha(0);
    this.layout();
    this.scale.on('resize', () => this.layout());
    // Place everything right before drawing, after the game camera has moved for this frame,
    // so the light sits exactly on the player and the plankton.
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.place());
  }

  /**
   * A 512 px square that is dark everywhere except a soft round opening in the middle
   * (clear inside 5% of its size, fully dark from 13%). Scaled up, it covers the screen.
   */
  private makeHole(): void {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#0a0f1e';
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'destination-out';
    const grad = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.13);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.65)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
    this.textures.addCanvas('light_hole', c);
  }

  /** One soft additive dot over each plankton on screen, twinkling, colored like sea sparkle. */
  private drawGlow(g: GameScene, glow: number): void {
    let n = 0;
    if (glow > 0.02 && g.food) {
      const cam = g.cameras.main;
      const v = cam.worldView;
      const t = this.time.now / 300;
      for (const f of g.food.items) {
        if (f.kind !== 'plankton' || !v.contains(f.img.x, f.img.y)) continue;
        let dot = this.glows[n];
        if (!dot) {
          dot = this.add.image(0, 0, 'light_dot').setBlendMode(Phaser.BlendModes.ADD);
          this.glows.push(dot);
        }
        n++;
        const tw = 0.6 + 0.4 * Math.sin(t + f.phase * 5);
        dot
          .setVisible(true)
          .setPosition((f.img.x - v.x) * cam.zoom, (f.img.y - v.y) * cam.zoom)
          .setScale(Math.max(0.5, (f.size * cam.zoom * 3) / 32))
          .setTint(f.phase > 3 ? 0x2ce8f5 : 0x63c74d)
          .setAlpha(glow * tw * 0.85);
      }
    }
    // Hot vents glow orange, softly flickering (strongest at night and in the dark Deep).
    if (g.vents) {
      const cam = g.cameras.main;
      const v = cam.worldView;
      for (const vent of g.vents) {
        if (!v.contains(vent.x, vent.y)) continue;
        let dot = this.glows[n];
        if (!dot) {
          dot = this.add.image(0, 0, 'light_dot').setBlendMode(Phaser.BlendModes.ADD);
          this.glows.push(dot);
        }
        n++;
        const flick = 0.8 + 0.2 * Math.sin(this.time.now / 170 + vent.x);
        dot
          .setVisible(true)
          .setPosition((vent.x - v.x) * cam.zoom, (vent.y - v.y) * cam.zoom)
          .setScale(Math.max(0.8, (90 * cam.zoom) / 32))
          .setTint(0xf77622)
          .setAlpha((0.35 + 0.45 * glow) * flick);
      }
    }
    // Anglerfish lures glow day and night (brighter in the dark), pulsing slowly.
    if (g.creatures) {
      const cam = g.cameras.main;
      const v = cam.worldView;
      for (const c of g.creatures) {
        const f = c.fish;
        const lure = f.species.lure;
        if (!lure || !f.active || !f.visible) continue;
        const ly = f.flipY ? -lure[1] : lure[1];
        const cos = Math.cos(f.rotation), sin = Math.sin(f.rotation);
        const wx = f.x + (lure[0] * cos - ly * sin) * f.size;
        const wy = f.y + (lure[0] * sin + ly * cos) * f.size;
        if (!v.contains(wx, wy)) continue;
        let dot = this.glows[n];
        if (!dot) {
          dot = this.add.image(0, 0, 'light_dot').setBlendMode(Phaser.BlendModes.ADD);
          this.glows.push(dot);
        }
        n++;
        const pulse = 0.75 + 0.25 * Math.sin(this.time.now / 420 + f.x * 0.01);
        dot
          .setVisible(true)
          .setPosition((wx - v.x) * cam.zoom, (wy - v.y) * cam.zoom)
          .setScale(Math.max(0.6, (f.size * cam.zoom * 1.6) / 32))
          .setTint(0x2ce8f5)
          .setAlpha((0.5 + 0.5 * glow) * pulse);
      }
    }
    for (let i = n; i < this.glows.length; i++) this.glows[i].setVisible(false);
  }

  private layout(): void {
    const { width, height } = this.scale;
    this.tint?.setSize(width, height);
  }

  private place(): void {
    const g = this.scene.get('Game') as GameScene;
    const L = g?.light;
    if (!L) return;
    const { width, height } = this.scale;
    this.tint.setFillStyle(L.tint, L.tintAlpha);
    this.drawGlow(g, L.glow);
    const p = g.player;
    if (!p || L.dark < 0.01) {
      this.dark.setAlpha(0);
      return;
    }
    // The opening follows the player on screen and grows with the player's size.
    const cam = g.cameras.main;
    const sx = (p.x - cam.worldView.x) * cam.zoom;
    const sy = (p.y - cam.worldView.y) * cam.zoom;
    const diag = Math.hypot(width, height);
    const hole = Math.max(170, p.size * cam.zoom * 4.5);
    // Half the image must still cover the screen from the player's spot; the clear part is 5% of it.
    const scale = Math.max((diag * 1.1) / 256, hole / 25.6);
    this.dark.setPosition(sx, sy).setScale(scale).setAlpha(L.dark);
  }
}
