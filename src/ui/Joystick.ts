import Phaser from 'phaser';
import { BALANCE } from '../data';

/**
 * Floating virtual joystick (touch). Put a thumb anywhere on the LEFT half of
 * the screen: the stick base appears under it, and dragging the knob steers.
 * Knob distance = swim strength. Releases when the finger lifts.
 *
 * When idle on a touch device, a faded stick sits bottom-left as a hint.
 * Output is read by PlayerController through `x`, `y`, `strength`, `active`.
 */
export class Joystick {
  active = false;
  x = 0;
  y = 0;
  strength = 0;
  /** Pointer currently driving the stick (-1 = none). */
  pointerId = -1;

  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private zone: Phaser.GameObjects.Zone;
  private homeX = 0;
  private homeY = 0;

  constructor(
    scene: Phaser.Scene,
    private onGrab: (pointerId: number) => void,
    private onRelease: (pointerId: number) => void,
  ) {
    const r = BALANCE.joystick.radius;
    // Invisible touch area on the left half, under the HUD buttons.
    this.zone = scene.add.zone(0, 0, 10, 10).setOrigin(0, 0).setInteractive().setDepth(-10);
    this.base = scene.add.circle(0, 0, r, 0xffffff, 0.08).setStrokeStyle(3, 0xffffff, 0.35).setDepth(50);
    this.knob = scene.add.circle(0, 0, r * 0.42, 0xffffff, 0.3).setStrokeStyle(2, 0xffffff, 0.7).setDepth(51);

    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.pointerId !== -1) return;
      this.pointerId = p.id;
      this.active = true;
      this.base.setPosition(p.x, p.y);
      this.knob.setPosition(p.x, p.y);
      this.setVisualActive(true);
      this.onGrab(p.id);
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId) this.track(p);
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (p.id === this.pointerId) this.release();
    });
    this.setVisualActive(false);
  }

  /** Lay out for the current screen size; only shown on touch devices. */
  layout(width: number, height: number, touch: boolean): void {
    this.zone.setSize(width * 0.5, height).setVisible(touch);
    if (touch) this.zone.setInteractive();
    else this.zone.disableInteractive();
    const r = BALANCE.joystick.radius;
    this.homeX = r + 40;
    this.homeY = height - r - 60;
    if (!this.active) {
      this.base.setPosition(this.homeX, this.homeY);
      this.knob.setPosition(this.homeX, this.homeY);
    }
    this.base.setVisible(touch);
    this.knob.setVisible(touch);
  }

  private track(p: Phaser.Input.Pointer): void {
    const r = BALANCE.joystick.radius;
    let dx = p.x - this.base.x;
    let dy = p.y - this.base.y;
    const len = Math.hypot(dx, dy);
    if (len > r) {
      dx = (dx / len) * r;
      dy = (dy / len) * r;
    }
    this.knob.setPosition(this.base.x + dx, this.base.y + dy);
    const s = Math.min(1, len / r);
    if (s < BALANCE.joystick.deadZone) {
      this.x = 0;
      this.y = 0;
      this.strength = 0;
    } else {
      this.x = dx;
      this.y = dy;
      // Remap so strength starts at 0 just outside the dead zone.
      this.strength = (s - BALANCE.joystick.deadZone) / (1 - BALANCE.joystick.deadZone);
    }
  }

  private release(): void {
    const id = this.pointerId;
    this.pointerId = -1;
    this.active = false;
    this.x = 0;
    this.y = 0;
    this.strength = 0;
    this.base.setPosition(this.homeX, this.homeY);
    this.knob.setPosition(this.homeX, this.homeY);
    this.setVisualActive(false);
    this.onRelease(id);
  }

  private setVisualActive(on: boolean): void {
    this.base.setAlpha(on ? 1 : 0.55);
    this.knob.setAlpha(on ? 1 : 0.55);
  }
}
