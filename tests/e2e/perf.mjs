// Performance meter: ?perf=1 shows the corner panel with live numbers; Options turns it on and off (remembered);
// a session of at least 30 s of play is logged on the device (`ce.perf`) when the page hides, and Options shows it.
// It also prints a rough benchmark of this machine (swiftshader in CI, so only the counts are meaningful).
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(200); } return false; };

await p.goto(base);
await G(() => localStorage.clear());
await p.goto(base + '?perf=1');
await waitFor(() => window.game?.scene.getScene('Game')?.player && document.getElementById('home').classList.contains('open'));
await waitFor(() => /fps/.test(document.getElementById('perfMeter')?.textContent || ''), undefined, 10000);
ok(await G(() => document.getElementById('perfMeter')?.style.display !== 'none'), '?perf=1 shows the meter');

await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
await p.keyboard.down('ArrowRight');
await p.waitForTimeout(4000);
const text = await G(() => document.getElementById('perfMeter').textContent);
const fps = +(/^(\d+) fps/.exec(text) || [])[1];
const awake = +(/awake (\d+)/.exec(text) || [])[1];
ok(fps > 0 && awake > 0, 'live numbers while playing: ' + text.replace(/\n/g, ' | '));

// keep playing past 30 s, then hide the page: the session is logged
await waitFor(() => window.cePerf.seconds() >= 31, undefined, 90000);
await p.keyboard.up('ArrowRight');
await G(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
const log = await G(() => JSON.parse(localStorage.getItem('ce.perf') || '[]'));
ok(log.length === 1 && log[0].seconds >= 30 && log[0].fps > 0 && log[0].maxAwake > 0 && ['smooth', 'ok', 'choppy'].includes(log[0].grade), 'the session is logged on the device: ' + JSON.stringify(log[0]));
console.log('BENCH', JSON.stringify(log[0]));
await G(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });

// Options: the last session, and the toggle (remembered without ?perf)
await G(() => window.game.scene.getScene('Game').goHome());
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#cardOptions');
ok(/Last session/.test(await G(() => document.getElementById('panel').textContent)), 'Options shows the last session');
await p.click('#oPerf');
ok(await G(() => document.getElementById('perfMeter').style.display === 'none' && localStorage.getItem('ce.perf.show') === null), 'Hide turns the meter off');
await p.click('#oPerf');
await p.goto(base);
await waitFor(() => /fps/.test(document.getElementById('perfMeter')?.textContent || ''), undefined, 20000);
ok(await G(() => document.getElementById('perfMeter').style.display !== 'none'), 'Show is remembered (no ?perf needed)');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
