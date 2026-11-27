// Leaving the water: leap out, land on an island, crawl, dry out, and splash back in.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(100); } return false; };

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
await G(() => { const g = window.game.scene.getScene('Game'); g.creatures.forEach((c) => { if (c.brain) c.fish.setPosition(c.fish.x > 3000 ? c.fish.x : 3500, 2000); }); });

const isl = await G(() => { const g = window.game.scene.getScene('Game'); const i = g.terrain.cfg.islands.find((x) => (x.style ?? 'sand') === 'sand'); return { x: i.x, w: i.width, top: g.landTopAt(i.x), surface: g.terrain.surfaceY }; });
ok(isl.top !== null && isl.top < isl.surface, `you can stand on top of an island (top ${Math.round(isl.top)} above the surface ${isl.surface})`);

// Leap: just beside the island, moving fast up and toward it.
await G((isl) => { const g = window.game.scene.getScene('Game'); const pl = g.player; pl.setPosition(isl.x - isl.w / 2 - 70, isl.surface + 24); pl.body.setVelocity(320, -520); pl.isSprinting = true; g.checkLeap(); }, isl);
ok(await G(() => window.game.scene.getScene('Game').landState === 'air'), 'sprinting up through the surface leaps out of the water');
ok(await waitFor(() => window.game.scene.getScene('Game').landState !== 'air', undefined, 20000), 'the leap comes down');
const st = await G(() => window.game.scene.getScene('Game').landState);
ok(st === 'land', 'and lands on the island: ' + st);

// Dry out: the timer runs; after the safe seconds it hurts.
const hp0 = await G(() => window.game.scene.getScene('Game').player.hp);
await G(() => { window.game.scene.getScene('Game').dryTime = 999; });
ok(await waitFor((hp0) => window.game.scene.getScene('Game').player.hp < hp0, hp0), 'staying out of the water too long hurts');
ok(await waitFor(() => window.game.scene.getScene('Hud').status.text.includes('DRYING OUT')), 'the screen warns you');

// Crawl off the edge: back into the water.
await G(() => { window.game.scene.getScene('Game').dryTime = 0; });
await p.keyboard.down('ArrowRight');
ok(await waitFor(() => window.game.scene.getScene('Game').landState === 'water', undefined, 40000), 'crawling off the edge splashes back into the water');
await p.keyboard.up('ArrowRight');
ok(await waitFor(() => window.game.scene.getScene('Game').dryTime === 0, undefined, 10000), 'the water soaks you again');

// Drying out can kill.
await G((isl) => { const g = window.game.scene.getScene('Game'); g.landState = 'land'; g.player.setPosition(isl.x, isl.top - 20); g.dryTime = 999; g.player.hp = 1; }, isl);
ok(await waitFor(() => window.game.scene.getScene('Game').dead), 'you can dry out completely');
ok(await waitFor(() => window.game.scene.getScene('Hud').deathTitle.text.includes('dried out')), 'the death screen says you dried out');
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
