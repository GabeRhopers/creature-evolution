import { describe, expect, it } from 'vitest';
import { DEADZONE, PAD, Pads } from '../src/input/gamepad';

/** A fake controller we can push buttons and sticks on. */
function fake() {
  const pad = {
    id: 'Test Pad (Vendor: 1234)',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
  };
  let t = 0;
  const pads = new Pads(() => [pad as unknown as Gamepad], () => t);
  const frame = () => {
    t += 16;
    pads.poll();
  };
  return { pad, pads, frame, press: (i: number, on = true) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 }) };
}

describe('controller input', () => {
  it('no controller: nothing connected, nothing pressed', () => {
    const pads = new Pads(() => [], () => 0);
    pads.poll();
    expect(pads.connected).toBe(false);
    expect(pads.down(PAD.A)).toBe(false);
    expect([pads.x, pads.y]).toEqual([0, 0]);
  });
  it('a press is seen once (justDown), then held (down)', () => {
    const { pads, frame, press } = fake();
    frame();
    press(PAD.A);
    frame();
    expect(pads.justDown(PAD.A)).toBe(true);
    frame();
    expect(pads.justDown(PAD.A)).toBe(false);
    expect(pads.down(PAD.A)).toBe(true);
  });
  it('polling twice in one frame does not lose a press', () => {
    const { pads, frame, press } = fake();
    frame();
    press(PAD.X);
    frame();
    pads.poll(); // a second reader in the same frame
    expect(pads.justDown(PAD.X)).toBe(true);
  });
  it('the stick has a dead zone, then rises smoothly to full', () => {
    const { pad, pads, frame } = fake();
    pad.axes = [DEADZONE * 0.9, 0, 0, 0];
    frame();
    expect(pads.x).toBe(0);
    pad.axes = [0.6, 0, 0, 0];
    frame();
    expect(pads.x).toBeGreaterThan(0.4);
    expect(pads.x).toBeLessThan(0.6);
    pad.axes = [0, -1, 0, 0];
    frame();
    expect(pads.y).toBeCloseTo(-1);
  });
  it('the D-pad steers at full speed when the stick is still', () => {
    const { pads, frame, press } = fake();
    press(PAD.LEFT);
    press(PAD.DOWN);
    frame();
    expect([pads.x, pads.y]).toEqual([-1, 1]);
  });
  it('triggers count as pressed past a light squeeze', () => {
    const { pad, pads, frame } = fake();
    pad.buttons[PAD.RT] = { pressed: false, value: 0.5 };
    frame();
    expect(pads.down(PAD.RT)).toBe(true);
  });
  it('knows the controller is in use, and stops after a quiet while', () => {
    const { pads, frame, press } = fake();
    press(PAD.A);
    frame();
    expect(pads.inUse).toBe(true);
    press(PAD.A, false);
    for (let i = 0; i < 1300; i++) frame(); // about 21 seconds
    expect(pads.connected).toBe(true);
    expect(pads.inUse).toBe(false);
  });
});
