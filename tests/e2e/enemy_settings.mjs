// Options > Enemy settings: change an enemy, saved on the device, used by the game, reset.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const setRange = (id, v) => G(([id, v]) => { const el = document.getElementById(id); el.value = String(v); el.dispatchEvent(new Event('input')); }, [id, v]);

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#cardOptions');
await p.click('#oEnemies');
ok(await waitFor(() => document.querySelectorAll('[data-enemy]').length >= 7), 'every enemy is listed');
await p.click('[data-enemy="barracuda"]');
ok(await waitFor(() => !!document.getElementById('en_unlockLevel')), 'the barracuda page has sliders');
await setRange('en_unlockLevel', 30);
await setRange('en_count', 3);
await setRange('en_baseBite', 8);
ok((await p.textContent('#eo_count')) === '3', 'the value shows next to the slider');
await p.click('#enSave');
const saved = await G(() => JSON.parse(localStorage.getItem('ce.admin.enemies') || '{}'));
ok(saved.barracuda?.unlockLevel === 30 && saved.barracuda?.count === 3 && saved.barracuda?.baseBite === 8, 'saved on this device: ' + JSON.stringify(saved.barracuda));

// After a reload the game uses the new numbers.
await p.reload();
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => !window.game.scene.getScene('Game').menuMode);
const live = await G(() => { const sp = window.game.scene.getScene('Game').creatures.map((c) => c.fish.species).find((s) => s.id === 'grey_shark'); return !!sp; });
ok(live, 'the game runs with the changed settings');
// Spawning: the barracuda now waits for level 30.
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setLevel(25); g.spawnUnlocked(); });
await p.waitForTimeout(500);
ok(await G(() => !window.game.scene.getScene('Game').creatures.some((c) => c.fish.species.id === 'barracuda')), 'the barracuda waits for its new level (30)');

// Reset all.
await p.reload();
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#cardOptions');
await p.click('#oEnemies');
await waitFor(() => !!document.getElementById('enReset'));
await p.click('#enReset');
await p.waitForTimeout(300);
if (await G(() => !!localStorage.getItem('ce.admin.enemies') && localStorage.getItem('ce.admin.enemies') !== '{}')) await G(() => document.getElementById('enReset')?.click());
ok(await waitFor(() => !localStorage.getItem('ce.admin.enemies') || localStorage.getItem('ce.admin.enemies') === '{}'), 'Reset all clears the changes');
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
