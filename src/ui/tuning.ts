// Live tuning panel (HTML overlay). Toggle with the ` key or the TUNE button.
// Sliders edit the shared species/balance objects while you play.
// "Copy JSON" puts the values on the clipboard to paste into src/data/*.json.
import { BALANCE, type Species } from '../data';

interface Knob {
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
}

let open = false;

export function toggleTuningPanel(species: Species): void {
  const el = document.getElementById('tuning');
  if (!el) return;
  open = !open;
  el.style.display = open ? 'block' : 'none';
  if (open) render(el, species);
}

function render(el: HTMLElement, sp: Species): void {
  const knobs: Knob[] = [
    { label: 'Acceleration', min: 100, max: 1500, step: 10, get: () => sp.accel, set: (v) => (sp.accel = v) },
    { label: 'Max speed', min: 60, max: 600, step: 5, get: () => sp.maxSpeed, set: (v) => (sp.maxSpeed = v) },
    { label: 'Sprint multiplier', min: 1, max: 3, step: 0.05, get: () => sp.sprintMultiplier, set: (v) => (sp.sprintMultiplier = v) },
    { label: 'Drag (higher = glides more)', min: 0.8, max: 0.995, step: 0.005, get: () => sp.drag, set: (v) => (sp.drag = v) },
    { label: 'Turn speed (rad/s)', min: 1, max: 12, step: 0.1, get: () => sp.turnSpeed, set: (v) => (sp.turnSpeed = v) },
    { label: 'Stamina drain /s', min: 5, max: 80, step: 1, get: () => BALANCE.stamina.drainPerSecond, set: (v) => (BALANCE.stamina.drainPerSecond = v) },
    { label: 'Stamina regen /s', min: 5, max: 80, step: 1, get: () => BALANCE.stamina.regenPerSecond, set: (v) => (BALANCE.stamina.regenPerSecond = v) },
    { label: 'Zoom-out strength', min: 0, max: 1.5, step: 0.05, get: () => BALANCE.camera.zoomExponent, set: (v) => (BALANCE.camera.zoomExponent = v) },
    { label: 'Size per level', min: 1.02, max: 1.3, step: 0.01, get: () => BALANCE.growth.sizePerLevel, set: (v) => (BALANCE.growth.sizePerLevel = v) },
  ];

  el.innerHTML = `<strong>Tuning: ${sp.displayName}</strong>`;
  for (const k of knobs) {
    const label = document.createElement('label');
    const value = document.createElement('span');
    value.className = 'v';
    value.textContent = String(k.get());
    label.textContent = k.label;
    label.appendChild(value);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(k.min);
    input.max = String(k.max);
    input.step = String(k.step);
    input.value = String(k.get());
    input.addEventListener('input', () => {
      k.set(Number(input.value));
      value.textContent = input.value;
    });
    el.appendChild(label);
    el.appendChild(input);
  }

  const copy = document.createElement('button');
  copy.textContent = 'Copy JSON';
  copy.style.marginTop = '10px';
  copy.addEventListener('click', async () => {
    const out = {
      species: { accel: sp.accel, maxSpeed: sp.maxSpeed, sprintMultiplier: sp.sprintMultiplier, drag: sp.drag, turnSpeed: sp.turnSpeed },
      stamina: BALANCE.stamina,
      camera: { zoomExponent: BALANCE.camera.zoomExponent },
      growth: { sizePerLevel: BALANCE.growth.sizePerLevel },
    };
    const text = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'Copied!';
    } catch {
      console.log(text);
      copy.textContent = 'See console';
    }
    setTimeout(() => (copy.textContent = 'Copy JSON'), 1500);
  });
  el.appendChild(copy);
}
