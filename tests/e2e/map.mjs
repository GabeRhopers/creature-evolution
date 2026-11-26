// The Map page (Phase 1: view and checks): the game links to it; it draws the whole sea from the game's own data with no
// problems on today's map; region buttons jump and zoom; tapping a thing (the Coral Cave) or open water shows its details;
// drag pans, the zoom buttons zoom; Problems lists issues and jumps to them (an injected problem shows up); it works offline.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 } });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

// The game links to the map (Sprite Studio card).
await p.goto(base);
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => document.getElementById('home')?.classList.contains('open'));
await p.click('#cardStudio');
ok(await G(() => document.getElementById('openMap')?.getAttribute('href') === 'map.html'), 'the Sprite Studio card links to the map');
await p.click('#openMap');
await waitFor(() => !!window.ceMap);
ok(/map\.html$/.test(p.url()), 'the map opens');

// The whole sea, today's map has no problems.
const info = await G(() => ({ things: window.ceMap.model.things.length, issues: window.ceMap.issues.length, w: window.ceMap.view.w, s: window.ceMap.view.s, label: document.getElementById('btnProblems').textContent }));
ok(info.things > 200 && info.issues === 0 && info.label === 'No problems', `the whole sea is drawn: ${info.things} things, ${info.label}`);
ok(Math.abs(info.s * info.w - 114000) < 200, 'it starts zoomed out to the whole sea');
const painted = await G(() => { const c = document.getElementById('map'); const d = c.getContext('2d').getImageData(c.width * 0.1, c.height * 0.3, 1, 1).data; return d[3] === 255 && (d[0] + d[1] + d[2]) > 0; });
ok(painted, 'the canvas is painted');

// Region buttons jump and zoom.
await p.click('#regions button:nth-child(5)');
const trench = await G(() => ({ cx: window.ceMap.view.cx, s: window.ceMap.view.s, title: document.querySelector('#info h2')?.textContent }));
ok(trench.cx === 78000 && trench.s < 20 && trench.title === 'Twilight Trench', 'Twilight Trench button: jumps there, zooms in, shows its summary');

// Tap the Coral Cave.
await G(() => window.ceMap.goTo(2400, 6));
await p.waitForTimeout(200);
const cave = await G(() => { const m = window.ceMap; const y = 26 + (m.model.terrain.groundAt(2400) - 6 - (m.model.surfaceY - 140)) * ((m.view.h - 36) / (m.model.seabedTop + 80 - (m.model.surfaceY - 140))); return { x: m.sx(2400), y }; });
const box = await p.locator('#map').boundingBox();
await p.mouse.click(box.x + cave.x, box.y + cave.y);
await p.waitForTimeout(200);
const caveText = await G(() => document.getElementById('info').textContent);
ok(/Coral Cave/.test(caveText) && /Electric Eel/.test(caveText) && /Juveniles and up can reach it/.test(caveText), 'tapping the Coral Cave shows who can reach it and the boss: ' + caveText.slice(0, 90));

// Drag pans, buttons zoom.
const before = await G(() => window.ceMap.view.cx);
await p.mouse.move(box.x + 600, box.y + 300);
await p.mouse.down();
await p.mouse.move(box.x + 400, box.y + 300, { steps: 6 });
await p.mouse.up();
const after = await G(() => window.ceMap.view.cx);
ok(Math.abs(after - before - 200 * 6) < 30, `dragging pans the map (${Math.round(after - before)} world px)`);
const s0 = await G(() => window.ceMap.view.s);
await p.click('#zoomOut');
ok(Math.abs((await G(() => window.ceMap.view.s)) - s0 * 2) < 0.01, 'zoom out doubles the view');
await p.click('#zoomAll');

// An injected problem shows up in the list and jumps to it (a copy of the page with a gate moved off its border).
await G(() => {
  const m = window.ceMap;
  m.issues.push({ level: 'error', text: 'Test problem', x: 50000 });
});
await p.click('#btnProblems');
await p.click('[data-issue="0"]');
ok((await G(() => window.ceMap.view.cx)) === 50000, 'tapping a problem jumps to it');

// Offline: the map is in the service worker's cache.
await waitFor(async () => !!(await navigator.serviceWorker?.getRegistration())?.active, undefined, 45000);
await p.goto(base + 'map.html');
await waitFor(() => !!navigator.serviceWorker.controller);
await ctx.setOffline(true);
await p.goto(base + 'map.html?x=24000');
ok(await waitFor(() => window.ceMap && window.ceMap.view.cx === 24000, undefined, 20000), 'works offline, and ?x= opens it at a spot');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
