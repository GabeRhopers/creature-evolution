// Day and night in the running game: four periods, smooth light, HUD clock and banner,
// glowing plankton at night, AI reads the light, and a saved run keeps its time of day.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => { errs.push(e.message); console.log('STACK', e.stack); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });

ok(await G(() => window.game.scene.getScene('Game').period === 'day'), 'a new run starts in the day');
ok(await G(() => window.game.scene.isActive('Light')), 'the light layer runs between the game and the HUD');
ok(await waitFor(() => window.game.scene.getScene('Hud').clock.text === 'DAY'), 'the HUD clock shows DAY');

// Jump to just before night: the change blends over several seconds, then the banner shows.
const dn = await G(() => { const g = window.game.scene.getScene('Game'); return { night: g.dayNight.startOf('night'), dusk: g.dayNight.startOf('dusk') }; });
await G((t) => { window.game.scene.getScene('Game').dayTime = t; }, dn.night + 20);
ok(await waitFor(() => window.game.scene.getScene('Game').period === 'night'), 'time passes into night');
ok(await waitFor(() => window.game.scene.getScene('Hud').clock.text === 'NIGHT'), 'the HUD clock shows NIGHT');
const night = await G(() => { const g = window.game.scene.getScene('Game'); const l = window.game.scene.getScene('Light'); return { dark: l.dark.alpha, tint: l.tint.fillAlpha, glow: g.food.glow, density: g.food.density, stars: g.stars.filter((s) => s.alpha > 0.2).length, moon: g.moon.alpha, vision: g.light.preyVision }; });
ok(night.dark > 0.4 && night.tint > 0.3, `night is dark (darkness ${night.dark.toFixed(2)}, tint ${night.tint.toFixed(2)})`);
ok(night.glow > 0.9 && night.density > 1.2, 'plankton glows and there is more of it at night');
ok(night.stars > 5 && night.moon > 0.9, 'stars and the moon are out');
ok(night.vision < 1, 'fish see less at night');
ok(await waitFor(() => window.game.scene.getScene('Light').glows.some((d) => d.visible)), 'glowing plankton is drawn above the darkness');

// Blend: halfway through the change from dusk to night, the darkness is between the two.
await G((t) => { window.game.scene.getScene('Game').dayTime = t; }, dn.night);
await p.waitForTimeout(300);
const mid = await G(() => window.game.scene.getScene('Light').dark.alpha);
ok(mid > 0.32 && mid < 0.6, `the change is a smooth blend (darkness ${mid.toFixed(2)} at the turn)`);

// The time of day is saved with the run.
await G((t) => { const g = window.game.scene.getScene('Game'); g.dayTime = t; g.checkpoint(true); }, dn.dusk + 10);
await p.reload();
await waitFor(() => !document.getElementById('btnContinue').hidden);
await p.click('#btnContinue');
ok(await waitFor((t) => { const g = window.game.scene.getScene('Game'); return !g.menuMode && Math.abs(g.dayTime - t) < 15 && g.period === 'dusk'; }, dn.dusk + 10), 'Continue brings back the same time of day');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
