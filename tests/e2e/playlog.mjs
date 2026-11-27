// Playtest log: every run is logged privately on the device (going home, dying with its cause and region, closing the
// game mid-run), Options shows the summary, and the report can be copied or saved.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:4173' });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const log = () => G(() => JSON.parse(localStorage.getItem('ce.playlog') || '[]'));
const play = async () => {
  await waitFor(() => document.getElementById('home').classList.contains('open'));
  await p.click('#btnPlay'); await p.waitForTimeout(400);
  await G(() => document.getElementById('pNew')?.click());
  await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode && g.runTime > 2; }, undefined, 45000);
};

await p.goto(base);
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);

// 1. going home
await play();
await G(() => window.game.scene.getScene('Game').goHome());
await waitFor(async () => JSON.parse(localStorage.getItem('ce.playlog') || '[]').length === 1);
let l = await log();
ok(l[0]?.end === 'home' && l[0].player === 'Player 1' && l[0].hero === 'crocodile' && l[0].seconds >= 2 && l[0].startLevel === 1, 'going home is logged: ' + JSON.stringify(l[0]));

// 2. dying: cause and region
await play();
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setLevel(4); g.playerDied(null, 'bitten'); });
await waitFor(async () => JSON.parse(localStorage.getItem('ce.playlog') || '[]').length === 2);
l = await log();
ok(l[1]?.end === 'died' && l[1].cause === 'bitten' && l[1].region === 'Coral Sea' && l[1].level === 4, 'a death is logged with its cause and region: ' + JSON.stringify(l[1]));

// 3. closing the game mid-run
await G(() => window.game.scene.getScene('Game').goHome());
await play();
await p.goto('about:blank');
await p.goto(base);
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);
l = await log();
ok(l.length === 3 && l[2].end === 'closed', 'closing the game mid-run is logged: ' + JSON.stringify(l[2]));

// 4. Options: summary and report
await p.click('#cardOptions');
ok(/3 runs/.test(await G(() => document.getElementById('panel').textContent)), 'Options shows the runs');
await p.click('#oPlaylog');
const text = await G(() => document.getElementById('plText').textContent);
ok(/Runs: 3 over 1 day/.test(text) && /Deaths by cause: bitten 1/.test(text) && /Deaths by region: Coral Sea 1/.test(text) && /died 1, went home 1, closed the game 1/.test(text), 'the report answers the playtest questions');
await p.click('#plCopy');
ok((await G(() => navigator.clipboard.readText())).startsWith('Creature Evolution playtest log'), 'Copy report puts it on the clipboard');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#plSave')]);
ok(/creature-evolution-playtest-\d{4}-\d\d-\d\d\.txt/.test(dl.suggestedFilename()), 'Save file downloads it: ' + dl.suggestedFilename());
ok((await G(() => localStorage.getItem('ce.playlog'))) !== null, 'the log is a ce.* key, so the backup file carries it');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
