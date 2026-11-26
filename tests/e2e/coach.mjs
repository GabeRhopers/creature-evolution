// The first minutes: a new player's first run shows one coach line at a time near the top, moving on as they do it
// (swim, plankton, swallow, bite, level up). Finishing is saved for that player, so the next run is quiet; one-time
// tips (full stomach) still show once; Options > Tips for new players brings the steps back.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const coach = () => G(() => { const t = window.game.scene.getScene('Hud').children.getByName('coach'); return t && t.alpha > 0 ? t.text : ''; });
const game = (f, a) => G(f, a);
const profile = () => G(() => JSON.parse(localStorage.getItem('ce.save.profile')).data.settings);

await p.goto(base);
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player && document.getElementById('home').classList.contains('open'));
await G(() => window.addEventListener('ce:perk', () => setTimeout(() => document.querySelector('[data-perk]')?.click(), 30)));
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });

ok(await waitFor(() => /arrow keys/.test(window.game.scene.getScene('Hud').children.getByName('coach').text)), 'a new player is told how to swim: ' + (await coach()));
ok(await waitFor(() => window.game.scene.getScene('Hud').hint.alpha < 0.3), 'the long help line stays out of the way while the coach talks');
await p.keyboard.down('ArrowRight');
ok(await waitFor(() => /glowing dots/.test(window.game.scene.getScene('Hud').children.getByName('coach').text), undefined, 60000), 'after swimming: eat plankton');
await p.keyboard.up('ArrowRight');
await game(() => { window.game.scene.getScene('Game').stats.plankton = 5; });
ok(await waitFor(() => /GREEN ring.*press Space/.test(window.game.scene.getScene('Hud').children.getByName('coach').text)), 'then: swallow a fish (green ring, Space on a keyboard)');
await game(() => { window.game.scene.getScene('Game').stats.fish = 1; });
ok(await waitFor(() => /ORANGE ring/.test(window.game.scene.getScene('Hud').children.getByName('coach').text)), 'then: bite a big one (orange ring)');
// a real bite counts
await game(() => {
  const g = window.game.scene.getScene('Game');
  const big = g.creatures.find((c) => !c.isPlayer && !c.asleep && c.fish.species.id === 'grey_shark') || g.creatures.find((c) => !c.isPlayer && !c.asleep && !c.boss);
  g.bite(g.creatures.find((c) => c.isPlayer), big);
});
ok(await waitFor(() => /level up/.test(window.game.scene.getScene('Hud').children.getByName('coach').text)), 'a real bite moves it on: level up next');
await game(() => { const g = window.game.scene.getScene('Game'); g.grantXp(g.player.xpNeeded + 1); });
ok(await waitFor(() => /Checkpoint Crab/.test(window.game.scene.getScene('Hud').children.getByName('coach').text)), 'level 2: well done, and what comes next');
ok(await waitFor(async () => JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.coachDone === true), 'finishing is saved for this player');
ok(await waitFor(() => window.game.scene.getScene('Hud').children.getByName('coach').alpha === 0, undefined, 12000), 'then the coach goes quiet');

// a one-time tip, when it matters
await game(() => { const g = window.game.scene.getScene('Game'); g.stomach.fill = g.stomach.capacity * 0.96; });
ok(await waitFor(() => /stomach is full/.test(window.game.scene.getScene('Hud').children.getByName('coach').text) && window.game.scene.getScene('Hud').children.getByName('coach').alpha > 0), 'a full stomach gets its tip once');
ok(await waitFor(async () => (JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.tipsSeen || []).includes('stomach')), 'the tip is remembered');

// next run: quiet
await game(() => window.game.scene.getScene('Game').goHome());
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#btnPlay'); await p.waitForTimeout(400);
await G(() => document.getElementById('pNew')?.click());
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode && g.runTime > 2; });
ok((await coach()) === '', 'the next run has no coach');

// Options: show again
await game(() => window.game.scene.getScene('Game').goHome());
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#cardOptions');
await p.click('#oCoach');
ok((await profile()).coachDone === false, 'Options > Show again resets it');
await p.click('#pClose');
await p.click('#btnPlay'); await p.waitForTimeout(400);
await G(() => document.getElementById('pNew')?.click());
ok(await waitFor(() => /arrow keys/.test(window.game.scene.getScene('Hud').children.getByName('coach').text) && window.game.scene.getScene('Hud').children.getByName('coach').alpha > 0), 'and the steps come back on the next run');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
