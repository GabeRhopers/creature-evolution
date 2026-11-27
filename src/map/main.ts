// The Map page (map.html), Phase 1: see the whole sea at a glance and spot problems. The same seabed the game uses is
// drawn from balance.json: regions in their water colors, the ground line (sand, ridges, seamounts), islands hanging from
// the surface, scenery, floats, gates, cave entrances and the start. The view squeezes the sea sideways (it is 114,000 px
// long and 3,200 px deep) and keeps its full depth, so its shape reads in one screen; zooming in brings it toward true
// proportions. Touch first: drag to pan, pinch or the buttons to zoom, tap anything for its details.
// Phase 2 (Edit): move, resize, add and delete islands, seamounts, ridges, scenery, floats and cave entrances, with undo.
// Edits are saved on this device as changes from the shipped map (src/map/edits.ts) and the game uses them the next time it opens.
import { BALANCE } from '../data';
import { buildMap, depthShare, mapChecks, regionAt, regionSummary, FOOTPRINT, type MapBalance, type MapIssue, type MapModel, type Thing } from './model';
import { addChoices, addThing, changedLists, editable, exportMap, ISLAND_STYLES, LIMITS, listsOf, loadLists, moveThing, removeThing, resizeThing, saveLists, savedOnOldMap, withLists, type AddChoice, type MapLists, type SizeChange } from './edits';

const $ = (id: string) => document.getElementById(id)!;
const B = BALANCE as unknown as MapBalance;
const SHIPPED = listsOf(B);
const store = (() => { try { localStorage.getItem('x'); return localStorage; } catch { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; } })();
/** The lists being edited (shipped, plus this device's saved edits). */
let L: MapLists = loadLists(SHIPPED, store);
const oldBase = savedOnOldMap(SHIPPED, store);
let M: MapModel = buildMap(withLists(B, L));
let issues: MapIssue[] = [];
const W = M.width;

// ---------------------------------------------------------------- colors (Endesga 32)
const GROUND: Record<string, string> = { sand: '#e4a672', ridge: '#733e39', seamount: '#5a6988' };
const ISLAND: Record<string, string> = { sand: '#ead4aa', mangrove: '#3e8948', iceberg: '#c0cbdc', volcano: '#3e2731', cave: '#262b44' };
const SCENERY = '#feae34';
const FLOAT = '#ffffff';
const GATE = '#f77622';
const CAVE = '#b55088';
const START = '#63c74d';
const SKY = '#8b9bb4';
const PICK = '#fee761';

// ---------------------------------------------------------------- view
const canvas = $('map') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
const view = {
  /** World x at the middle of the screen (may be any number: the sea loops). */
  cx: B.world.startX,
  /** World px per screen px, sideways. */
  s: 100,
  w: 0,
  h: 0,
};
const layers = { scenery: true, floats: true, depth: true, labels: true };
let selected: Thing | null = null;
let editing = false;
/** The model is rebuilt on the next paint after an edit (dragging rebuilds at most once a frame). */
let dirty = false;
function rebuild(): void {
  dirty = false;
  M = buildMap(withLists(B, L));
  issues = mapChecks(M);
  if (oldBase && changedLists(SHIPPED, L)) issues.unshift({ level: 'warn', x: B.world.startX, text: 'The game was updated since these map edits were made. Check them, or Reset all in Edit.' });
  if (selected) selected = M.things.find((t) => t.id === selected!.id) ?? null;
  updateProblems();
}
const SKY_PX = 140; // world px of sky shown above the surface
const BELOW = 80; // world px shown below the seabed
const minS = 1.2;
const maxS = () => W / Math.max(1, view.w);
const wrap = (x: number) => ((x % W) + W) % W;
/** Vertical: the whole water column always fits. */
const vy = () => (view.h - 36) / (M.seabedTop + BELOW - (M.surfaceY - SKY_PX));
const sy = (wy: number) => 26 + (wy - (M.surfaceY - SKY_PX)) * vy();
const sx = (wx: number) => {
  // The screen position of world x, choosing the copy of the loop nearest the view's center.
  let d = wx - view.cx;
  d = ((d % W) + W + W / 2) % W - W / 2;
  return view.w / 2 + d / view.s;
};
const wxAt = (px: number) => view.cx + (px - view.w / 2) * view.s;

function resize(): void {
  const head = $('head').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--head', head + 'px');
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = r.width;
  view.h = r.height;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  view.s = Math.min(Math.max(view.s, minS), maxS());
  draw();
}

// ---------------------------------------------------------------- drawing
let pending = false;
function draw(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    paint();
  });
}

function paint(): void {
  if (dirty) rebuild();
  const { w, h } = view;
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#0b1a2e';
  g.fillRect(0, 0, w, h);
  const surf = sy(M.surfaceY), bed = sy(M.seabedTop + BELOW);
  // Sky.
  g.fillStyle = SKY;
  g.fillRect(0, 26, w, surf - 26);
  // Water, ground and islands, one thin column at a time.
  const step = view.s > 30 ? 2 : 1;
  for (let px = 0; px < w; px += step) {
    const x = wxAt(px);
    const r = regionAt(M, x);
    const ground = sy(M.terrain.groundAt(x));
    // Water in the region's 4 colors, top to bottom (even bands down to the seabed level; the ground covers the rest).
    const band = (sy(M.seabedTop) - surf) / 4;
    for (let k = 0; k < 4; k++) {
      g.fillStyle = r.water[k] ?? r.water[r.water.length - 1];
      g.fillRect(px, surf + band * k, step, band + 1);
    }
    g.fillStyle = GROUND[M.terrain.kindAt(x)] ?? GROUND.sand;
    g.fillRect(px, ground, step, bed - ground + 4);
    const c = M.terrain.ceilAt(x);
    if (isFinite(c)) {
      const isl = islandAt(x);
      g.fillStyle = ISLAND[isl?.style ?? 'sand'] ?? ISLAND.sand;
      g.fillRect(px, surf - 6, step, sy(c) - surf + 6);
    }
  }
  // Depth bands and how deep each stage can swim.
  if (layers.depth) {
    g.setLineDash([6, 6]);
    g.lineWidth = 1;
    g.font = '600 11px "Work Sans", sans-serif';
    for (const a of B.areas.list.slice(1)) {
      const y = sy(M.surfaceY + (M.seabedTop - M.surfaceY) * a.from);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (const a of B.areas.list) g.fillText(a.name, 6, sy(M.surfaceY + (M.seabedTop - M.surfaceY) * a.from) + 14);
  }
  // Mid-water structures: rock outcrops as grey ovals, one-way shelves as coral ledges.
  for (const st of M.terrain.structures) {
    const x = sx(st.x), rx = st.rx / view.s;
    if (x + rx < 0 || x - rx > w) continue;
    if (st.kind === 'rock') {
      g.fillStyle = '#5a6988';
      g.beginPath(); g.ellipse(x, sy(st.y), Math.max(2, rx), Math.max(2, sy(st.y + st.ry) - sy(st.y)), 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#d77643';
      g.fillRect(x - rx, sy(st.y), Math.max(3, rx * 2), 3);
    }
  }
  // Region names along the top.
  g.font = '700 12px "Pixelify Sans", monospace';
  g.textBaseline = 'top';
  // Each region may show twice near the loop's seam, so draw it for every copy that is on screen.
  for (const r of B.regions.list) for (const k of [-1, 0, 1]) {
    const a = view.w / 2 + (r.from + k * W - view.cx) / view.s;
    const b2 = a + (r.to - r.from) / view.s;
    const left = Math.max(0, a), right = Math.min(w, b2);
    if (right - left < 30) continue;
    g.fillStyle = '#181425';
    g.fillRect(left, 0, right - left, 24);
    g.fillStyle = r.water[0];
    g.fillRect(left, 20, right - left, 4);
    g.fillStyle = '#ffffff';
    const label = right - left > 90 ? r.name : r.name.split(' ')[0];
    g.fillText(label, left + 6, 5, right - left - 10);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    if (a >= 0 && a <= w) g.fillRect(a, 0, 1, h);
  }
  g.textBaseline = 'alphabetic';
  // Things: gates, caves and the start first, so their names win over scenery names.
  placed = [];
  const showLabels = layers.labels && view.s < 24;
  const order = (t: Thing) => (t.kind === 'gate' || t.kind === 'cave' || t.kind === 'start' ? 0 : 1);
  for (const t of [...M.things].sort((a, b) => order(a) - order(b))) {
    const x = sx(t.x);
    const half = Math.max(t.width / 2, (FOOTPRINT[t.label] ?? 0) / 2) / view.s;
    if (x + half < -20 || x - half > w + 20) continue;
    if (t.kind === 'gate') {
      g.fillStyle = GATE;
      g.fillRect(x - 1.5, surf, 3, sy(M.terrain.groundAt(t.x)) - surf);
      label(t.label, x, surf + 16, GATE, true);
    } else if (t.kind === 'cave') {
      const y = sy(M.terrain.groundAt(t.x));
      g.fillStyle = CAVE;
      g.beginPath(); g.arc(x, y - 6, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
      label(t.label, x, y - 18, '#fff', true);
    } else if (t.kind === 'start') {
      const y = sy(M.surfaceY + (M.seabedTop - M.surfaceY) * 0.25);
      g.fillStyle = START;
      g.fillRect(x - 1, y - 18, 2, 22);
      g.beginPath(); g.moveTo(x + 1, y - 18); g.lineTo(x + 12, y - 13); g.lineTo(x + 1, y - 8); g.fill();
      label('Start', x, y - 22, START, true);
    } else if (t.kind === 'scenery' && layers.scenery) {
      const y = sy(M.terrain.groundAt(t.x));
      const fw = Math.max(5, half * 2);
      g.fillStyle = SCENERY;
      g.fillRect(x - fw / 2, y - 6, fw, 6);
      if (showLabels) label(t.label, x, y - 10, '#fff', false);
    } else if (t.kind === 'float' && layers.floats) {
      g.fillStyle = FLOAT;
      g.fillRect(x - 2, surf - 5, 4, 4);
      if (showLabels) label(t.label, x, surf - 9, '#fff', false);
    }
  }
  // Problems: a small triangle above the spot.
  for (const i of issues) {
    const x = sx(i.x);
    if (x < -10 || x > w + 10) continue;
    g.fillStyle = i.level === 'error' ? '#ff6b6b' : '#feae34';
    g.beginPath(); g.moveTo(x, 34); g.lineTo(x - 6, 26); g.lineTo(x + 6, 26); g.fill();
  }
  // The selection.
  if (selected) {
    const x = sx(selected.x);
    const half = Math.max(6, Math.max(selected.width, FOOTPRINT[selected.label] ?? 0) / 2 / view.s);
    g.strokeStyle = PICK;
    g.lineWidth = editing && editable(selected.kind) ? 3 : 2;
    g.setLineDash(editing && editable(selected.kind) ? [] : [4, 3]);
    g.strokeRect(x - half, 28, half * 2, bed - 30);
    g.setLineDash([]);
  }
  $('scaleNote').textContent = view.s >= maxS() * 0.95 ? 'The whole sea (squeezed sideways)' : `1 screen px = ${Math.round(view.s)} world px sideways`;
}

/** Labels already drawn this frame: a new one that would overlap them is skipped (important ones are drawn first). */
let placed: Array<{ l: number; r: number; t: number; b: number }> = [];
function label(text: string, x: number, y: number, color: string, bold: boolean): void {
  g.font = `${bold ? 700 : 600} 11px "Work Sans", sans-serif`;
  const half = g.measureText(text).width / 2 + 3;
  const box = { l: x - half, r: x + half, t: y - 11, b: y + 2 };
  if (placed.some((p) => p.l < box.r && box.l < p.r && p.t < box.b && box.t < p.b)) return;
  placed.push(box);
  g.textAlign = 'center';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.textAlign = 'left';
}

function islandAt(x: number) {
  const wx = wrap(x);
  return M.b.terrain.islands.find((i) => {
    const d = Math.abs(wx - i.x) % W;
    return Math.min(d, W - d) < i.width / 2;
  });
}

// ---------------------------------------------------------------- picking and details
const near = (a: number, b: number) => {
  const d = Math.abs(wrap(a) - wrap(b));
  return Math.min(d, W - d);
};
function hitTest(px: number, py: number): Thing | null {
  const x = wxAt(px);
  let best: Thing | null = null, bd = 16;
  // Small things first: gates, caves, the start, scenery, floats (within 16 screen px sideways, and near where they are
  // drawn: scenery and caves on the seabed, floats at the surface; a gate is the whole water column).
  const surf = sy(M.surfaceY);
  const anchorY = (t: Thing) =>
    t.kind === 'float' ? surf : t.kind === 'structure' ? sy(M.surfaceY + (M.seabedTop - M.surfaceY) * (t.size ?? 0.5)) : t.kind === 'start' ? sy(M.surfaceY + (M.seabedTop - M.surfaceY) * 0.25) - 10 : t.kind === 'gate' ? py : sy(M.terrain.groundAt(t.x)) - 6;
  for (const t of M.things) {
    if (t.kind === 'island' || t.kind === 'seamount' || t.kind === 'ridge') continue;
    if ((t.kind === 'scenery' && !layers.scenery) || (t.kind === 'float' && !layers.floats)) continue;
    if (Math.abs(anchorY(t) - py) > 30) continue;
    const d = Math.abs(sx(t.x) - px);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) return best;
  // Shapes: an island when tapping between the surface and its underside; a seamount or ridge near the ground.
  const ground = sy(M.terrain.groundAt(x));
  const ceil = M.terrain.ceilAt(x);
  if (isFinite(ceil) && py <= sy(ceil) + 8) {
    const i = M.things.find((t) => t.kind === 'island' && near(t.x, x) < t.width / 2);
    if (i) return i;
  }
  if (py >= ground - 30) {
    const k = M.terrain.kindAt(x);
    const shape = M.things.find((t) => (t.kind === k) && near(t.x, x) < t.width / 2);
    if (shape) return shape;
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Which stage can swim down to this depth share. */
function reach(depth: number): string {
  const st = B.stages.list.find((s) => depth <= s.maxDepth + 0.001);
  return st ? `${st.name}s and up can reach it` : 'Too deep for any stage';
}

function showThing(t: Thing): void {
  selected = t;
  const r = regionAt(M, t.x);
  const groundDepth = depthShare(M, M.terrain.groundAt(t.x));
  const rows: string[] = [`${esc(r.name)} · x ${Math.round(t.x).toLocaleString()}`];
  if (t.kind === 'island') rows.push(`${Math.round(t.width).toLocaleString()} px wide · reaches ${Math.round(t.size ?? 0)} px below the surface`);
  if (t.kind === 'seamount') rows.push(`${Math.round(t.width).toLocaleString()} px wide · its top is ${pct(t.size ?? 0)} of the way down · ${reach(t.size ?? 1)}`);
  if (t.kind === 'ridge') rows.push(`${Math.round(t.width).toLocaleString()} px wide · ${Math.round(t.size ?? 0)} px tall`);
  if (t.kind === 'scenery' || t.kind === 'cave') rows.push(`On the seabed ${pct(groundDepth)} of the way down · ${reach(groundDepth)}`);
  if (t.kind === 'scenery' && B.scenery.hide?.includes(t.label)) rows.push('A hiding place');
  if (t.kind === 'gate') {
    const gate = B.gates.list.find((x) => `gate:${x.id}` === t.id);
    rows.push(`Opens after the level ${gate?.crab ?? '?'} Checkpoint Crab`);
  }
  if (t.kind === 'cave') {
    const boss = B.bosses.list.find((x) => `cave:${x.id}` === t.id);
    rows.push(`${esc(boss?.name ?? '')} waits inside · from level ${boss?.level ?? '?'}`);
  }
  if (t.kind === 'start') rows.push('Where every new run begins');
  const mine = issues.filter((i) => i.thing === t.id || (t.kind !== 'start' && near(i.x, t.x) < Math.max(200, t.width / 2) && !i.thing));
  const title = t.kind === 'island' ? `${cap(t.label)} island` : t.kind === 'seamount' ? 'Seamount' : t.kind === 'ridge' ? 'Rocky ridge' : t.kind === 'float' ? `${cap(t.label)} (floating)` : t.kind === 'gate' ? `Gate: ${t.label}` : cap(t.label);
  $('info').innerHTML = `<h2>${esc(title)}</h2>${rows.map((x) => `<div class="row">${x}</div>`).join('')}${mine.map((i) => `<div class="issue ${i.level}">${i.level === 'error' ? 'Problem' : 'Check'}: ${esc(i.text)}</div>`).join('')}${editing ? editControls(t) : ''}`;
  $('info').classList.add('open');
  if (editing) bindEditControls(t);
  draw();
}

// ---------------------------------------------------------------- editing
interface Slider { k: 'width' | 'size' | 'scale'; name: string; min: number; max: number; step: number; value: number; show: (v: number) => string }
function sliders(t: Thing): Slider[] {
  const px = (v: number) => `${Math.round(v).toLocaleString()} px`;
  const i = +t.id.split(':')[1];
  if (t.kind === 'island') return [
    { k: 'width', name: 'Width', min: LIMITS.island.width[0], max: LIMITS.island.width[1], step: 10, value: t.width, show: px },
    { k: 'size', name: 'Reaches below the surface', min: LIMITS.island.size[0], max: LIMITS.island.size[1], step: 5, value: t.size ?? 200, show: px },
  ];
  if (t.kind === 'seamount') return [
    { k: 'width', name: 'Width', min: LIMITS.seamount.width[0], max: LIMITS.seamount.width[1], step: 10, value: t.width, show: px },
    { k: 'size', name: 'Top (how far down)', min: LIMITS.seamount.size[0], max: LIMITS.seamount.size[1], step: 0.01, value: t.size ?? 0.5, show: (v) => `${pct(v)} down` },
  ];
  if (t.kind === 'ridge') return [
    { k: 'width', name: 'Width', min: LIMITS.ridge.width[0], max: LIMITS.ridge.width[1], step: 10, value: t.width, show: px },
    { k: 'size', name: 'Height', min: LIMITS.ridge.size[0], max: LIMITS.ridge.size[1], step: 5, value: t.size ?? 200, show: px },
  ];
  if (t.kind === 'scenery') return [
    { k: 'scale', name: 'Size', min: LIMITS.scenery.scale[0], max: LIMITS.scenery.scale[1], step: 0.05, value: L.pieces[i]?.scale ?? 1, show: (v) => `x ${v.toFixed(2)}` },
  ];
  return [];
}
function editControls(t: Thing): string {
  if (!editable(t.kind)) return `<div class="edit"><div class="row">${t.kind === 'gate' ? 'Gates stay on the region borders. Moving them comes with region editing (Phase 4).' : 'The start stays in the middle of the Coral Sea.'}</div></div>`;
  const style = t.kind === 'island' ? `<label class="field">Look <select data-style>${ISLAND_STYLES.map((s) => `<option value="${s}" ${(M.b.terrain.islands[+t.id.split(':')[1]]?.style ?? 'sand') === s ? 'selected' : ''}>${cap(s)}</option>`).join('')}</select></label>` : '';
  return `<div class="edit">${sliders(t).map((s) => `<label class="field">${s.name} <b data-show="${s.k}">${s.show(s.value)}</b><input type="range" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${s.value}"></label>`).join('')}${style}
    <div class="row">Drag it on the map to move it.</div>
    <div class="actions">${t.kind === 'cave' ? '' : '<button id="btnDelete" class="bad">Delete</button>'}</div></div>`;
}
let gestureBefore: string | null = null;
function bindEditControls(t: Thing): void {
  const list = sliders(t);
  document.querySelectorAll<HTMLInputElement>('#info input[data-k]').forEach((inp) => {
    const s = list.find((x) => x.k === inp.dataset.k)!;
    inp.oninput = () => {
      gestureBefore ??= JSON.stringify(L);
      const v = Number(inp.value);
      L = resizeThing(L, t.id, { [s.k]: v } as SizeChange);
      document.querySelector<HTMLElement>(`#info [data-show="${s.k}"]`)!.textContent = s.show(v);
      dirty = true;
      draw();
    };
    inp.onchange = () => {
      if (gestureBefore) commit(gestureBefore);
      gestureBefore = null;
      rebuild();
      if (selected) showThing(selected);
    };
  });
  const sel = document.querySelector<HTMLSelectElement>('#info select[data-style]');
  if (sel) sel.onchange = () => edit(() => resizeThing(L, t.id, { style: sel.value }));
  const del = document.getElementById('btnDelete');
  if (del) del.onclick = () => deleteSelected();
}
/** Make one edit: keep the old lists for undo, save, rebuild, refresh the details. */
function edit(fn: () => MapLists, select?: string): void {
  const before = JSON.stringify(L);
  L = fn();
  commit(before);
  rebuild();
  if (select !== undefined) selected = M.things.find((t) => t.id === select) ?? null;
  if (selected) showThing(selected); else { $('info').classList.remove('open'); draw(); }
}
const history: string[] = [];
let future: string[] = [];
function commit(before: string): void {
  if (before === JSON.stringify(L)) return;
  history.push(before);
  if (history.length > 80) history.shift();
  future = [];
  saveLists(SHIPPED, L, store);
  updateEditBar();
}
function undo(): void {
  const prev = history.pop();
  if (!prev) return;
  future.push(JSON.stringify(L));
  L = JSON.parse(prev);
  afterHistory();
}
function redo(): void {
  const next = future.pop();
  if (!next) return;
  history.push(JSON.stringify(L));
  L = JSON.parse(next);
  afterHistory();
}
function afterHistory(): void {
  saveLists(SHIPPED, L, store);
  rebuild();
  updateEditBar();
  if (selected) showThing(selected); else draw();
}
function deleteSelected(): void {
  if (!selected || !editable(selected.kind) || selected.kind === 'cave') return;
  const id = selected.id;
  selected = null;
  edit(() => removeThing(L, id), '');
}
function addAtCenter(c: AddChoice): void {
  const r = addThing(L, c, view.cx, W);
  closeSide();
  edit(() => r.lists, r.id);
}
function updateEditBar(): void {
  const n = changedLists(SHIPPED, L);
  ($('btnUndo') as HTMLButtonElement).disabled = !history.length;
  ($('btnRedo') as HTMLButtonElement).disabled = !future.length;
  $('editState').textContent = n ? 'Changes saved on this device. The game uses them next time it opens.' : 'No changes: this is the shipped map.';
  ($('btnReset') as HTMLButtonElement).disabled = !n;
  $('btnEdit').classList.toggle('changed', n > 0);
}
function setEditing(on: boolean): void {
  editing = on;
  $('btnEdit').setAttribute('aria-pressed', String(on));
  $('btnEdit').textContent = on ? 'Done' : 'Edit';
  $('editBar').classList.toggle('open', on);
  document.body.classList.toggle('editing', on);
  updateEditBar();
  resize();
  if (selected) showThing(selected); else draw();
}

function showRegion(x: number): void {
  selected = null;
  const r = regionAt(M, x);
  const n = regionSummary(M, r.id);
  const depth = depthShare(M, M.terrain.groundAt(x));
  $('info').innerHTML = `<h2>${esc(r.name)}</h2>
    <div class="row">${(r.to - r.from).toLocaleString()} px wide (x ${r.from.toLocaleString()} to ${r.to.toLocaleString()})</div>
    <div class="row">${n.island} islands · ${n.seamount} seamounts · ${n.ridge} ridges · ${n.structure} mid-water structures · ${n.scenery} scenery pieces · ${n.float} floating things${n.cave ? ` · ${n.cave} cave` : ''}</div>
    <div class="row">Here (x ${Math.round(wrap(x)).toLocaleString()}): the seabed is ${pct(depth)} of the way down</div>`;
  $('info').classList.add('open');
  draw();
}

// ---------------------------------------------------------------- moving around
function zoomAt(px: number, factor: number): void {
  const before = wxAt(px);
  view.s = Math.min(maxS(), Math.max(minS, view.s * factor));
  view.cx = before - (px - view.w / 2) * view.s;
  draw();
}
function goTo(x: number, s?: number): void {
  view.cx = x;
  if (s) view.s = Math.min(maxS(), Math.max(minS, s));
  draw();
}

const pointers = new Map<number, { x: number; y: number }>();
let downAt = { x: 0, y: 0, t: 0 };
let pinch: { d: number; s: number; mid: number } | null = null;
/** Dragging a thing in Edit: the lists when the drag began, the thing's x then, and where the finger went down. */
let drag: { id: string; base: MapLists; before: string; x0: number; px0: number; moved: boolean } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pointers.size === 1) downAt = { x: e.offsetX, y: e.offsetY, t: performance.now() };
  drag = null;
  if (pointers.size === 1 && editing) {
    const t = hitTest(e.offsetX, e.offsetY);
    if (t && editable(t.kind)) drag = { id: t.id, base: L, before: JSON.stringify(L), x0: t.x, px0: e.offsetX, moved: false };
  }
  if (pointers.size === 2) {
    if (drag) { if (drag.moved) { L = drag.base; dirty = true; } drag = null; }
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: view.s, mid: (a.x + b.x) / 2 };
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.offsetX - p.x;
  p.x = e.offsetX;
  p.y = e.offsetY;
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = (a.x + b.x) / 2;
    const anchor = wxAt(pinch.mid);
    view.s = Math.min(maxS(), Math.max(minS, pinch.s * (pinch.d / Math.max(10, d))));
    view.cx = anchor - (mid - view.w / 2) * view.s;
    pinch.mid = mid;
    draw();
  } else if (pointers.size === 1 && drag) {
    if (!drag.moved && Math.abs(e.offsetX - drag.px0) < 6) return;
    if (!drag.moved) { drag.moved = true; selected = M.things.find((t) => t.id === drag!.id) ?? null; }
    L = moveThing(drag.base, drag.id, drag.x0 + (e.offsetX - drag.px0) * view.s, W);
    dirty = true;
    draw();
  } else if (pointers.size === 1) {
    view.cx -= dx * view.s;
    draw();
  }
});
const up = (e: PointerEvent) => {
  const was = pointers.size;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (pointers.size >= 1 && drag) { L = drag.base; dirty = true; drag = null; draw(); }
  if (was === 1 && drag?.moved) {
    const d = drag;
    drag = null;
    commit(d.before);
    rebuild();
    selected = M.things.find((t) => t.id === d.id) ?? null;
    if (selected) showThing(selected);
    return;
  }
  drag = null;
  if (was === 1 && Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) < 8 && performance.now() - downAt.t < 500) {
    const t = hitTest(e.offsetX, e.offsetY);
    if (t) showThing(t);
    else showRegion(wxAt(e.offsetX));
  }
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { view.cx += e.deltaX * view.s; draw(); return; }
  zoomAt(e.offsetX, Math.exp(e.deltaY * 0.0015));
}, { passive: false });
$('zoomIn').onclick = () => zoomAt(view.w / 2, 0.5);
$('zoomOut').onclick = () => zoomAt(view.w / 2, 2);
$('zoomAll').onclick = () => goTo(W / 2, maxS());
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') { view.cx -= view.w * 0.25 * view.s; draw(); }
  if (e.key === 'ArrowRight') { view.cx += view.w * 0.25 * view.s; draw(); }
  if (e.key === '+' || e.key === '=') zoomAt(view.w / 2, 0.5);
  if (e.key === '-') zoomAt(view.w / 2, 2);
  if (!editing || (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
  if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected();
});

// ---------------------------------------------------------------- header: regions, layers, problems
for (const r of B.regions.list) {
  const b = document.createElement('button');
  b.textContent = r.name;
  b.style.borderColor = r.water[0];
  b.onclick = () => { goTo((r.from + r.to) / 2, ((r.to - r.from) / view.w) * 1.08); showRegion((r.from + r.to) / 2); };
  $('regions').appendChild(b);
}
function openSide(html: string, bind?: () => void): void {
  $('side').innerHTML = html;
  $('side').classList.add('open');
  bind?.();
}
const closeSide = () => $('side').classList.remove('open');
$('btnLayers').onclick = () => {
  if ($('side').classList.contains('open') && $('side').dataset.kind === 'layers') return closeSide();
  $('side').dataset.kind = 'layers';
  const names: Record<keyof typeof layers, string> = { scenery: 'Scenery on the seabed', floats: 'Things floating at the surface', depth: 'Depth bands (Shallows, Reef, Deep)', labels: 'Names when zoomed in' };
  openSide(`<h2>Layers</h2>${(Object.keys(layers) as Array<keyof typeof layers>).map((k) => `<label style="display:block;margin:6px 0"><input type="checkbox" data-layer="${k}" ${layers[k] ? 'checked' : ''}> ${names[k]}</label>`).join('')}<button id="sideClose">Close</button>`, () => {
    document.querySelectorAll<HTMLInputElement>('[data-layer]').forEach((c) => (c.onchange = () => { layers[c.dataset.layer as keyof typeof layers] = c.checked; draw(); }));
    $('sideClose').onclick = closeSide;
  });
};
function updateProblems(): void {
  const errors = issues.filter((i) => i.level === 'error').length;
  $('btnProblems').textContent = issues.length ? `Problems (${issues.length})` : 'No problems';
  $('btnProblems').classList.toggle('has', issues.length > 0);
  $('btnProblems').classList.toggle('err', errors > 0);
  if ($('side').classList.contains('open') && $('side').dataset.kind === 'problems') showProblems();
}
$('btnProblems').onclick = () => {
  if ($('side').classList.contains('open') && $('side').dataset.kind === 'problems') return closeSide();
  showProblems();
};
function showProblems(): void {
  $('side').dataset.kind = 'problems';
  openSide(`<h2>${issues.length ? `${issues.length} thing${issues.length > 1 ? 's' : ''} to check` : 'No problems found'}</h2>
    <p class="row" style="color:var(--muted);font-size:13px">The map checks that the start is clear, regions cover the whole sea, gates sit on borders, cave entrances can be reached, islands leave water under them and big scenery doesn't overlap.</p>
    <ol>${issues.map((i, k) => `<li class="issue ${i.level}" data-issue="${k}">${esc(i.text)}</li>`).join('')}</ol><button id="sideClose">Close</button>`, () => {
    document.querySelectorAll<HTMLElement>('[data-issue]').forEach((li) => (li.onclick = () => {
      const i = issues[+li.dataset.issue!];
      goTo(i.x, 12);
      const t = i.thing ? M.things.find((x) => x.id === i.thing) : null;
      if (t) showThing(t); else showRegion(i.x);
    }));
    $('sideClose').onclick = closeSide;
  });
}

// ---------------------------------------------------------------- Edit bar: undo, redo, add, export, reset
$('btnEdit').onclick = () => setEditing(!editing);
$('btnUndo').onclick = undo;
$('btnRedo').onclick = redo;
$('btnAdd').onclick = () => {
  if ($('side').classList.contains('open') && $('side').dataset.kind === 'add') return closeSide();
  $('side').dataset.kind = 'add';
  const choices = addChoices(SHIPPED);
  const group = (title: string, kinds: string[]) => {
    const items = choices.map((c, k) => ({ c, k })).filter(({ c }) => kinds.includes(c.kind));
    return `<h3>${title}</h3><div class="choices">${items.map(({ c, k }) => `<button data-add="${k}">${esc(cap(c.label))}</button>`).join('')}</div>`;
  };
  openSide(`<h2>Add</h2><p class="row" style="color:var(--muted);font-size:13px">It goes in the middle of the screen; then drag it into place.</p>
    ${group('Islands', ['island'])}${group('Seabed', ['seamount', 'ridge'])}${group('Scenery', ['scenery'])}${group('Floating', ['float'])}<button id="sideClose">Close</button>`, () => {
    document.querySelectorAll<HTMLElement>('[data-add]').forEach((b) => (b.onclick = () => addAtCenter(choices[+b.dataset.add!])));
    $('sideClose').onclick = closeSide;
  });
};
$('btnExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exportMap(L)], { type: 'application/json' }));
  a.download = `creature-evolution-map-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$('btnReset').onclick = () => {
  if (!confirm('Put the whole map back the way it shipped? This removes every map edit on this device.')) return;
  edit(() => JSON.parse(JSON.stringify(SHIPPED)));
};

// ---------------------------------------------------------------- start
// A link can open the map at a spot: map.html?x=2400
const qx = Number(new URLSearchParams(location.search).get('x'));
window.addEventListener('resize', resize);
rebuild();
resize();
if (new URLSearchParams(location.search).has('edit')) setEditing(true);
if (Number.isFinite(qx) && qx > 0) goTo(qx, 12);
else goTo(W / 2, maxS());
// For tests and debugging.
(window as unknown as { ceMap: unknown }).ceMap = {
  get model() { return M; }, get issues() { return issues; }, get lists() { return L; }, get selected() { return selected; },
  view, hitTest, sx, sy, wxAt, showThing, goTo, setEditing, undo, redo, rebuild,
};
