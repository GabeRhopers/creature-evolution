// Minimal play screen: compact bars with icons and a level badge; the details live in the pause menu.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
ok(await waitFor(() => window.game.scene.getScene('Hud').levelBadge.text === 'LV 1'), 'a small level badge shows the level');
ok(await G(() => !window.game.scene.getScene('Hud').info.visible), 'the long stats line is gone from the play screen');
ok(await G(() => window.game.scene.getScene('Hud').hint.alpha > 0.3), 'the help line shows at the start');
await G(() => { window.game.scene.getScene('Game').runTime = 60; });
ok(await waitFor(() => window.game.scene.getScene('Hud').hint.alpha < 0.1), 'then it fades away');
await p.keyboard.press('Escape');
ok(await waitFor(() => !!document.querySelector('.details')), 'pausing shows the details');
const details = await p.textContent('.details');
for (const k of ['Coral Sea', 'Tide', 'Health', 'Bite', 'Swallows up to', 'Stomach', 'Kills', 'Time']) ok(details.includes(k), 'details include ' + k);
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
