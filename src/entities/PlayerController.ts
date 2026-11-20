import Phaser from 'phaser';
import type { Fish, SwimIntent } from './Fish';

/**
 * Turns keyboard, mouse and touch input into a SwimIntent for the player fish.
 *
 * Keyboard: WASD / arrow keys to swim, Shift to sprint, Space to swallow.
 * Mouse: hold left button to swim toward the pointer; right button swallows.
 * Touch: hold a finger to swim toward it (farther = faster); a second finger
 *   sprints. HUD buttons (SPRINT, EAT) set `uiSprint` / `uiSwallow` and
 *   reserve their pointer so it does not steer.
 */
export class PlayerController {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  /** Set by the HUD's on-screen sprint button. */
  uiSprint = false;
  /** Set by the HUD's on-screen EAT button. */
  uiSwallow = false;
  /** Pointer ids currently owned by HUD buttons (ignored for steering). */
  readonly uiPointers = new Set<number>();

  constructor(private scene: Phaser.Scene, private fish: Fish) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E') as Record<string, Phaser.Input.Keyboard.Key>;
    scene.input.addPointer(2);
    scene.input.mouse?.disableContextMenu();
  }

  /** True while the player is trying to swallow (Space, E, right mouse, EAT button). */
  wantsSwallow(): boolean {
    const mouse = this.scene.input.mousePointer;
    return this.keys.SPACE.isDown || this.keys.E.isDown || this.uiSwallow || (mouse.isDown && mouse.rightButtonDown());
  }

  read(): SwimIntent {
    const k = this.keys;
    let dx = 0;
    let dy = 0;
    if (k.A.isDown || k.LEFT.isDown) dx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) dx += 1;
    if (k.W.isDown || k.UP.isDown) dy -= 1;
    if (k.S.isDown || k.DOWN.isDown) dy += 1;
    let strength = dx !== 0 || dy !== 0 ? 1 : 0;
    let sprint = k.SHIFT.isDown || this.uiSprint;

    // Pointer steering (mouse button held, or a finger on screen).
    const steering = this.steeringPointers();
    if (steering.length > 0 && strength === 0) {
      const p = steering[0];
      const cam = this.scene.cameras.main;
      const world = cam.getWorldPoint(p.x, p.y);
      const vx = world.x - this.fish.x;
      const vy = world.y - this.fish.y;
      // Distance measured in screen pixels so it feels the same at any zoom.
      const screenDist = Math.hypot(vx, vy) * cam.zoom;
      if (screenDist > 14) {
        dx = vx;
        dy = vy;
        strength = Phaser.Math.Clamp((screenDist - 14) / 140, 0.15, 1);
      }
      if (steering.length > 1) sprint = true;
    }

    return { dirX: dx, dirY: dy, strength, sprint };
  }

  private steeringPointers(): Phaser.Input.Pointer[] {
    return this.scene.input.manager.pointers.filter(
      (p) => p.isDown && !this.uiPointers.has(p.id) && !(p.wasTouch === false && p.rightButtonDown()),
    );
  }
}
