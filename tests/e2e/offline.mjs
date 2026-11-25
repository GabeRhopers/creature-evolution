// Offline play, end to end: visit once online, then with no network at all:
//  1. the game page loads from the device (service worker), with the bundled fonts,
//  2. a run starts and the hero swims,
//  3. Sprite Studio opens a starter design (a link with ?project=),
//  4. the backup file round-trips: Save file downloads every key, Load file restores it after a reset,
//  5. nothing is fetched from another site.
import { chromium } from 'playwright-core';
import fs from 'fs';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
const outside = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('request', (r) => { const u = r.url(); if (!u.startsWith('http://localhost:4173/') && !u.startsWith('blob:') && !u.startsWith('data:')) outside.push(u); });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(200); } return false; };

// online first visit: the service worker installs and caches everything
await p.goto(base);
await G(() => localStorage.clear());
const ready = await waitFor(async () => { const r = await navigator.serviceWorker?.getRegistration(); return !!r?.active; }, undefined, 45000);
ok(ready, 'the service worker is installed on the first visit');
await p.reload();
await waitFor(() => !!navigator.serviceWorker.controller);
// let the precache finish (the active worker has every file)
await waitFor(async () => { const keys = await caches.keys(); if (!keys.length) return false; const c = await caches.open(keys.find((k) => k.includes('precache')) ?? keys[0]); return (await c.keys()).length > 60; }, undefined, 45000);

// 1. offline
await ctx.setOffline(true);
await p.reload();
const loaded = await waitFor(() => window.game?.scene.getScene('Game')?.player && document.getElementById('home').classList.contains('open'), undefined, 45000);
ok(loaded, 'offline: the game loads from the device');
const fontOk = await G(async () => { await document.fonts.ready; return document.fonts.check('700 20px "Pixelify Sans"') && [...document.fonts].some((f) => f.family.includes('Pixelify') && f.status === 'loaded'); });
ok(fontOk, 'offline: the pixel font is there');

// 2. play
await p.click('#btnPlay');
const playing = await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode && g.player.texture.key.startsWith('stage_'); }, undefined, 30000);
ok(playing, 'offline: a run starts with the hero design');
await p.keyboard.down('ArrowRight'); await p.waitForTimeout(1200); await p.keyboard.up('ArrowRight');
ok((await G(() => window.game.scene.getScene('Game').frameErrors ?? 0)) === 0, 'offline: it swims without errors');

// 3. studio
await p.goto(base + 'studio/index.html?project=spino-adult');
const studio = await waitFor(() => /Spino/.test(document.getElementById('projName')?.value || ''), undefined, 30000);
ok(studio, 'offline: Sprite Studio opens a starter design from a link');
ok(await G(() => !!window.SkinMaker), 'offline: the skin maker is there too');

// 4. backup round trip
await p.goto(base);
await waitFor(() => document.getElementById('home').classList.contains('open'));
await G(() => localStorage.setItem('spritestudio:sk-test-adult', JSON.stringify({ name: 'Backup check', w: 4, h: 4, palette: [], poses: [] })));
await p.click('#cardOptions');
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#oBackup')]);
const file = await dl.path();
const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
ok(saved.app === 'creature-evolution' && saved.keys['spritestudio:sk-test-adult'] && Object.keys(saved.keys).some((k) => k.startsWith('ce.save.')), 'Save file has the saves and the studio drawings: ' + Object.keys(saved.keys).length + ' keys');
await G(() => localStorage.removeItem('spritestudio:sk-test-adult'));
await p.setInputFiles('#backupFile', file);
await p.click('#bYes');
await waitFor(() => !!localStorage.getItem('spritestudio:sk-test-adult'), undefined, 20000);
ok(await G(() => JSON.parse(localStorage.getItem('spritestudio:sk-test-adult') || '{}').name === 'Backup check'), 'Load file brings everything back');

ok(outside.length === 0, 'nothing is fetched from another site: ' + outside.slice(0, 3).join(' '));
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
