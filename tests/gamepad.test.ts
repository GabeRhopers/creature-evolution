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

import { DEFAULT_PAD_MAP, PAD as P2, Pads as Pads2, assignButton, padHint, sanitizePadMap } from '../src/input/gamepad';

describe('controller button mapping', () => {
  it('keeps a good map and rejects junk', () => {
    expect(sanitizePadMap(null)).toBeNull();
    expect(sanitizePadMap({ eat: [2], sprint: [1], ability: [0], pause: [9] })).toEqual({ eat: [2], sprint: [1], ability: [0], pause: [9] });
    // A button used twice only counts once; the D-pad can't be mapped; an action left empty -> default map.
    expect(sanitizePadMap({ eat: [0], sprint: [0], ability: [12], pause: [9] })).toBeNull();
    expect(sanitizePadMap('x')).toBeNull();
  });
  it('moving a button takes it from the other action, and no action is left without a button', () => {
    const m = assignButton(DEFAULT_PAD_MAP, 'eat', P2.X, true);
    expect(m.eat).toEqual([P2.X]);
    expect(m.ability).not.toContain(P2.X);
    const m2 = assignButton({ eat: [0], sprint: [1], ability: [2], pause: [9] }, 'eat', 2, false);
    expect(m2.eat).toEqual([0, 2]);
    expect(m2.ability.length).toBeGreaterThan(0);
    expect(m2.ability).not.toContain(2);
  });
  it('the game reads actions through the map', () => {
    let pressed = [false, false, false];
    const fake = () => [{ connected: true, id: 'Test pad', axes: [0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: !!pressed[i], value: pressed[i] ? 1 : 0 })) }] as unknown as Gamepad[];
    let t = 0;
    const p = new Pads2(fake, () => (t += 16));
    p.map = assignButton(DEFAULT_PAD_MAP, 'eat', P2.X, true);
    pressed = [false, false, true];
    p.poll();
    expect(p.act('eat')).toBe(true);
    expect(p.actJust('ability')).toBe(false);
    expect(p.firstPressed()).toBe(P2.X);
    expect(padHint(p.map)).toContain('X eat');
  });
});

import { buttonName, padStyle } from '../src/input/gamepad';
describe('button names per controller', () => {
  it('names buttons the way each controller prints them', () => {
    expect(padStyle('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)')).toBe('xbox');
    expect(padStyle('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padStyle('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('switch');
    expect(buttonName(0, 'playstation')).toBe('Cross');
    expect(buttonName(0, 'switch')).toBe('B');
    expect(buttonName(9, 'xbox')).toBe('Menu');
  });
});
