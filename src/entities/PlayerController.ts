import Phaser from 'phaser';
import type { Fish, SwimIntent } from './Fish';
import { pads } from '../input/gamepad';

/**
 * Turns keyboard, mouse and touch input into a SwimIntent for the player fish.
 *
 * Keyboard: WASD / arrow keys to swim, Shift to sprint, Space to eat
 *   (swallow if small enough, bite otherwise), E or Q to Dash.
 * Mouse: hold left button to swim toward the pointer; right button eats.
 * Touch: virtual joystick on the left half of the screen (HUD sets `stick`);
 *   a finger held elsewhere still swims toward it; a second finger sprints. HUD buttons (SPRINT, EAT, DASH) set `uiSprint` / `uiSwallow` /
 *   `uiDash` and reserve their pointer so it does not steer.
 * Controller (src/input/gamepad.ts): left stick or D-pad swims (the stick is analog),
 *   A eats, B / LT / RT sprint, X / Y / RB use the stage ability. Start pauses (menu.ts).
 */
export class PlayerController {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  /** Set by the HUD's on-screen sprint button. */
  uiSprint = false;
  /** Set by the HUD's on-screen EAT button. */
  uiSwallow = false;
  /** Set (once per tap) by the HUD's DASH button; consumed by consumeDash(). */
  uiDash = false;
  /** Virtual joystick output (set by the HUD every frame). */
  stick = { active: false, x: 0, y: 0, strength: 0 };
  /** Pointer ids currently owned by HUD buttons (ignored for steering). */
  readonly uiPointers = new Set<number>();

  constructor(private scene: Phaser.Scene, private fish: Fish) {
    const kb = scene.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,Q') as Record<string, Phaser.Input.Keyboard.Key>;
    // Up to 3 touch points (steer + sprint/eat). Only add once; restarts reuse them.
    if (scene.input.manager.pointersTotal < 3) scene.input.addPointer(3 - scene.input.manager.pointersTotal);
    scene.input.mouse?.disableContextMenu();
  }

  /** True while the player wants to eat: swallow or bite (Space, right mouse, EAT button). */
  wantsSwallow(): boolean {
    const mouse = this.scene.input.mousePointer;
    return this.keys.SPACE.isDown || this.uiSwallow || (mouse.isDown && mouse.rightButtonDown()) || pads.act('eat');
  }

  /** True once per Dash press (E, Q or DASH button). */
  consumeDash(): boolean {
    pads.poll();
    const pad = pads.actJust('ability');
    const pressed = Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.Q) || this.uiDash || pad;
    this.uiDash = false;
    return pressed;
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
    pads.poll();
    let sprint = k.SHIFT.isDown || this.uiSprint || pads.act('sprint');

    // Controller: the left stick is analog (push a little to swim slowly), the D-pad is full speed.
    if (strength === 0 && (pads.x || pads.y)) {
      dx = pads.x;
      dy = pads.y;
      strength = Math.min(1, Math.hypot(pads.x, pads.y));
    }

    // Virtual joystick has priority over pointer steering.
    if (this.stick.active && strength === 0) {
      dx = this.stick.x;
      dy = this.stick.y;
      strength = this.stick.strength;
    }

    // Pointer steering (mouse button held, or a finger on screen).
    const steering = this.stick.active ? [] : this.steeringPointers();
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
