// Soundtrack moods follow the region, time of day, depth and the crab; danger adds a pulse.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const mood = () => G(() => window.game.scene.getScene('Hud').wantMood);

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'sunny'), 'Coral Sea by day: Sunny Reef (the recorded track)');
await G(() => { const g = window.game.scene.getScene('Game'); g.dayTime = g.dayNight.startOf('night') + 40; });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'moonlit'), 'night: Moonlit Reef');
await G(() => { const g = window.game.scene.getScene('Game'); g.dayTime = g.dayNight.startOf('dusk') + 25; });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'golden'), 'dusk: Golden Hour');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(30000, 600); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'swamp'), 'the Swamp has its own music');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(106000, 600); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'ice'), 'so does the Frozen Sea');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(63000, 600); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'volcano'), 'and the Volcanic Rift (Fire Below)');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(78000, 600); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'deep'), 'the Twilight Trench sounds like the Deep');
await G(() => { const g = window.game.scene.getScene('Game'); g.crabLevel = 20; g.player.setLevel(25); g.player.setPosition(4300, g.seabedTop - 160); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'deep'), 'deep water: Into the Deep');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(4300, 600); if (!g.crab) g.spawnCrab(20); g.crab.fish.setPosition(4600, 700); });
ok(await waitFor(() => window.game.scene.getScene('Hud').wantMood === 'crab', undefined, 25000), 'the Checkpoint Crab gets its own fight music');
ok(await G(() => window.game.scene.getScene('Hud').soundtrack.current !== null), 'the soundtrack follows the mood');
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
