// The Map page, Phase 2 (Edit): drag an island to move it, undo and redo, resize a seamount with its slider, change an
// island's look, add a galleon and delete it, an island moved onto the start shows up in Problems. The Original map is never
// changed: the first edit makes "My map 1" (saved on the device). The game keeps playing the Original until the player picks
// the map on the home screen; Start over and Delete map work on the copy only.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => d.accept());
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const canvasBox = async () => (await p.locator('#map').boundingBox());

await p.goto(base + 'map.html');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => !!window.ceMap);
await p.click('#btnEdit');
ok(await G(() => document.getElementById('editBar').classList.contains('open') && document.getElementById('btnEdit').textContent === 'Done'), 'Edit opens the edit bar');

// Drag island 0 (a sand island in the Coral Sea) 120 screen px to the right.
const x0 = await G(() => window.ceMap.lists.islands[0].x);
await G((x) => window.ceMap.goTo(x, 10), x0);
await p.waitForTimeout(200);
const box = await canvasBox();
const sxy = await G((x) => { const m = window.ceMap.model; return { x: window.ceMap.sx(x), y: (window.ceMap.sy(m.surfaceY) + window.ceMap.sy(m.terrain.ceilAt(x))) / 2 }; }, x0);
await p.mouse.move(box.x + sxy.x, box.y + sxy.y);
await p.mouse.down();
for (let k = 1; k <= 6; k++) { await p.mouse.move(box.x + sxy.x + k * 20, box.y + sxy.y); await p.waitForTimeout(30); }
await p.mouse.up();
const moved = await G(() => ({ x: window.ceMap.lists.islands[0].x, sel: window.ceMap.selected?.id, saved: !!localStorage.getItem('ce.maps') && window.ceMap.mapId !== 'original', pick: document.querySelector('#mapPick option:checked')?.textContent, model: window.ceMap.model.things.find((t) => t.id === 'island:0').x }));
ok(Math.abs(moved.x - (x0 + 1200)) < 30 && moved.model === moved.x && moved.sel === 'island:0' && moved.saved && moved.pick === 'My map 1', `dragging moves the island (${x0} -> ${moved.x}), selects it and saves it in a copy, "${moved.pick}" (the Original never changes)`);
ok(await G(() => window.ceMap.view.cx) === x0, 'dragging a thing does not pan the map');

await p.click('#btnUndo');
ok(await G(() => window.ceMap.lists.islands[0].x) === x0 && await G(() => window.ceMap.mapId !== 'original'), 'Undo puts it back (still on the copy)');
await p.click('#btnRedo');
ok(await G(() => window.ceMap.lists.islands[0].x) === moved.x, 'Redo moves it again');

// The island's look.
await p.selectOption('#info select[data-style]', 'volcano');
ok(await G(() => window.ceMap.lists.islands[0].style === 'volcano' && window.ceMap.model.b.terrain.islands[0].style === 'volcano'), 'the Look menu changes the island to a volcano');

// A seamount's slider (the Coral Cave's seamount near x 2400).
await G(() => { const t = window.ceMap.model.things.find((t) => t.kind === 'seamount' && Math.abs(t.x - 2400) < 400); window.ceMap.goTo(t.x, 10); window.ceMap.showThing(t); });
const smId = await G(() => window.ceMap.selected.id);
await G(() => { const i = document.querySelector('#info input[data-k="width"]'); i.value = '2000'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); });
const sm = await G((id) => ({ w: window.ceMap.lists.seamounts[+id.split(':')[1]].width, label: document.querySelector('#info [data-show="width"]').textContent, row: document.querySelector('#info .row').nextElementSibling?.textContent }), smId);
ok(sm.w === 2000 && sm.label === '2,000 px', `the width slider resizes the seamount (${sm.w}, ${sm.label})`);

// Add a galleon, then delete it.
const nPieces = await G(() => window.ceMap.lists.pieces.length);
await p.click('#btnAdd');
await p.click('#side [data-add]:text-is("Galleon")');
const added = await G(() => ({ n: window.ceMap.lists.pieces.length, last: window.ceMap.lists.pieces.at(-1), sel: window.ceMap.selected?.id, cx: Math.round(window.ceMap.view.cx), side: document.getElementById('side').classList.contains('open') }));
ok(added.n === nPieces + 1 && added.last.kind === 'galleon' && Math.abs(added.last.x - added.cx) <= 1 && added.sel === `scenery:${nPieces}` && !added.side, 'Add > Galleon puts one in the middle of the screen and selects it');
await p.click('#btnDelete');
ok(await G(() => window.ceMap.lists.pieces.length) === nPieces && await G(() => !document.getElementById('info').classList.contains('open')), 'Delete removes it');

// An island moved onto the start shows up as a problem.
await G(() => { const t = window.ceMap.model.things.find((t) => t.id === 'island:1'); window.ceMap.showThing(t); });
const startX = await G(() => window.ceMap.model.things.find((t) => t.id === 'start').x);
await G((x) => window.ceMap.goTo(window.ceMap.lists.islands[1].x, 10), null);
await p.waitForTimeout(200);
const i1 = await G(() => { const m = window.ceMap.model, x = window.ceMap.lists.islands[1].x; return { x: window.ceMap.sx(x), y: (window.ceMap.sy(m.surfaceY) + window.ceMap.sy(m.terrain.ceilAt(x))) / 2, from: x, s: window.ceMap.view.s }; });
const dx = (startX - i1.from) / i1.s;
await p.mouse.move(box.x + i1.x, box.y + i1.y);
await p.mouse.down();
for (let k = 1; k <= 8; k++) { await p.mouse.move(box.x + i1.x + (dx * k) / 8, box.y + i1.y); await p.waitForTimeout(30); }
await p.mouse.up();
const prob = await G(() => ({ n: window.ceMap.issues.length, text: document.getElementById('btnProblems').textContent, mine: document.querySelector('#info .issue')?.textContent }));
ok(prob.n > 0 && /Problems \(\d+\)/.test(prob.text) && /start/.test(prob.mine ?? ''), `an island on the start is flagged at once: ${prob.text}, "${prob.mine}"`);
await p.click('#btnUndo');
ok(await G(() => window.ceMap.issues.length) === 0 && await G(() => document.getElementById('btnProblems').textContent) === 'No problems', 'Undo clears the problem');

// The game still plays the Original; picking the map on the home screen plays it.
const saved = await G(() => ({ x: window.ceMap.lists.islands[0].x, w: window.ceMap.lists.seamounts[+window.ceMap.model.things.find((t) => t.kind === 'seamount' && Math.abs(t.x - 2400) < 400).id.split(':')[1]].width }));
await p.goto(base);
await waitFor(() => !!window.game?.scene.getScene('Game')?.terrain);
const orig = await G(() => ({ x: window.game.scene.getScene('Game').terrain.cfg.islands[0].x, chip: document.getElementById('btnMap').hidden ? null : document.getElementById('mapName').textContent }));
ok(orig.x === x0 && orig.chip === 'Original', `the game still plays the Original by default (island at ${orig.x}; home shows Map: ${orig.chip})`);
await waitFor(() => document.getElementById('home')?.classList.contains('open'));
await p.click('#btnMap');
ok(await G(() => [...document.querySelectorAll('#panel .toggle')].map((r) => r.textContent).join('|').includes('My map 1')), 'the map choice lists the Original and My map 1');
await Promise.all([p.waitForNavigation(), p.click('#panel [data-map]')]);
await waitFor(() => !!window.game?.scene.getScene('Game')?.terrain);
const game = await G(() => { const t = window.game.scene.getScene('Game').terrain.cfg; return { x: t.islands[0].x, style: t.islands[0].style, ws: t.seamounts.map((s) => s.width), chip: document.getElementById('mapName').textContent }; });
ok(game.x === saved.x && game.style === 'volcano' && game.ws.includes(saved.w) && game.chip === 'My map 1', `after picking it, the game plays My map 1 (island at ${game.x}, ${game.style})`);

// The map page opens the map being played; Start over makes the copy the Original again; the Original never changed.
await p.goto(base + 'map.html?edit');
await waitFor(() => !!window.ceMap);
ok(await G(() => window.ceMap.lists.islands[0].x) === saved.x && await G(() => document.getElementById('editBar').classList.contains('open')) && await G(() => document.querySelector('#mapPick option:checked').textContent) === 'My map 1 (playing)', 'the map opens on the map being played, edits still there (?edit opens Edit)');
await G(() => window.ceMap.openMap('original'));
ok(await G(() => window.ceMap.lists.islands[0].x) === x0 && await G(() => document.getElementById('btnReset').disabled && document.getElementById('btnDeleteMap').disabled), 'the Original is untouched and cannot be reset or deleted');
await G(() => window.ceMap.openMap(JSON.parse(localStorage.getItem('ce.maps')).maps[0].id));
await p.click('#btnReset');
ok(await G(() => window.ceMap.lists.islands[0].x) === x0 && await G(() => document.getElementById('btnReset').disabled), 'Start over makes My map 1 a copy of the Original again');
await p.click('#btnDeleteMap');
ok(await G(() => window.ceMap.mapId === 'original' && !localStorage.getItem('ce.maps') && !localStorage.getItem('ce.map.play')), 'Delete map removes it, and the game goes back to the Original');

// Export gives a file the import tool takes.
await G(() => window.ceMap.goTo(30000, 10));
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#btnExport')]);
const fs = await import('node:fs');
const text = fs.readFileSync(await dl.path(), 'utf8');
const ex = JSON.parse(text);
ok(ex.kind === 'creature-evolution-map-export' && ex.terrain.islands.length > 40 && /creature-evolution-map-\d{4}-\d\d-\d\d\.json/.test(dl.suggestedFilename()), `Export file downloads the whole map (${dl.suggestedFilename()})`);

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
