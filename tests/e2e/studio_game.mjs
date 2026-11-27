// Sprite Studio -> game, end to end, on a fresh device (no cloud):
//  1. A studio link to a starter design opens that design (first visit included).
//  2. Opening a design without editing keeps its starter timestamp (so it still gets upgrades).
//  3. A real edit gets a new timestamp, and the game uses the edited drawing for:
//     the hero stage (croc hatchling), a reef fish (blue tang) and the checkpoint crab.
//  4. Studio pose speeds (fps) reach the game.
//  5. The Sprite Studio card lists every creature design with a link.
//  6. Try in game plays the drawing.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const SEED_STAMPS = ['2026-11-21T08:45:00.000Z', '2026-11-21T09:30:00.000Z', '2026-11-21T11:30:00.000Z', '2026-11-21T12:00:00.000Z'];
const local = (id) => G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id) || 'null'), id);

await p.goto(base);
await G(() => localStorage.clear());

// 1. first visit deep link
await p.goto(base + 'studio/index.html?project=croc-hatchling');
const shipped = await G(() => fetch('seeds/croc-hatchling.json').then((r) => r.json()));
await waitFor((n) => document.getElementById('projName').value === n, shipped.name, 20000);
const name = await p.inputValue('#projName');
ok(name === shipped.name, `first visit opens the linked design: "${name}"`);

// 2. opening keeps the starter timestamp
await p.waitForTimeout(500);
const opened = await local('croc-hatchling');
ok(SEED_STAMPS.includes(opened?.updatedAt), 'opening without editing keeps the starter timestamp: ' + opened?.updatedAt);
await p.reload();
await waitFor(() => !!document.getElementById('projName').value && document.getElementById('projName').value !== 'My character');
ok(SEED_STAMPS.includes((await local('croc-hatchling'))?.updatedAt), 'still untouched after reopening');

// 3a. a real edit (paint the idle frame) gets a new timestamp
const box = await p.locator('#cv').boundingBox();
await p.locator('[data-tool=pencil]').click();
await p.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
await p.mouse.down();
await p.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.35, { steps: 12 });
await p.mouse.up();
await waitFor(() => { const v = JSON.parse(localStorage.getItem('spritestudio:croc-hatchling') || 'null'); return v && !['2026-11-21T08:45:00.000Z', '2026-11-21T09:30:00.000Z', '2026-11-21T11:30:00.000Z', '2026-11-21T12:00:00.000Z'].includes(v.updatedAt); });
const edited = await local('croc-hatchling');
ok(!SEED_STAMPS.includes(edited.updatedAt), 'an edit gives a new timestamp');
ok(edited.poses[0].frames[0] !== opened.poses[0].frames[0], 'the edit is in the saved drawing');

// 3b. simulate studio edits of a reef fish and the crab: repaint every pixel with one new color
//     and set custom pose speeds, the way the studio saves them.
await G(() => {
  for (const id of ['fish-blue_tang', 'crab-checkpoint']) {
    const v = JSON.parse(localStorage.getItem('spritestudio:' + id));
    v.palette = v.palette.slice(0, 31).concat(['#ff00ff']);
    const k = (v.palette.length - 1).toString(36).toUpperCase();
    const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const ch = ALPH[v.palette.length - 1];
    v.poses = v.poses.map((po) => ({ ...po, fps: po.name === 'move' ? 12 : po.fps, frames: po.frames.map((f) => f.replace(/[^.]/g, ch)) }));
    v.updatedAt = new Date().toISOString();
    localStorage.setItem('spritestudio:' + id, JSON.stringify(v));
  }
});

// game: hero stage uses the edited drawing
await p.goto(base);
await waitFor(() => !!window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode && g.player.texture.key.startsWith('stage_'); });
const heroDiff = await G(() => {
  const g = window.game.scene.getScene('Game'); const pl = g.player; const tex = pl.texture; const src = tex.getSourceImage();
  const proj = JSON.parse(localStorage.getItem('spritestudio:croc-hatchling'));
  const fr = tex.get(pl.skinFrames.idle[0]);
  const c = document.createElement('canvas'); c.width = proj.w; c.height = proj.h; const x = c.getContext('2d');
  x.drawImage(src, fr.cutX, fr.cutY, proj.w, proj.h, 0, 0, proj.w, proj.h);
  const d = x.getImageData(0, 0, proj.w, proj.h).data; const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const f = proj.poses.find((q) => q.name === 'idle').frames[0]; let diff = 0;
  for (let i = 0; i < proj.w * proj.h; i++) {
    const chr = f[i]; const a = d[i * 4 + 3];
    if (chr === '.') { if (a > 0) diff++; continue; }
    const hx = '#' + [0, 1, 2].map((k) => d[i * 4 + k].toString(16).padStart(2, '0')).join('');
    if (hx !== proj.palette[ALPH.indexOf(chr)].toLowerCase()) diff++;
  }
  return diff;
});
ok(heroDiff === 0, 'the hatchling in the game matches the edited studio drawing (pixels different: ' + heroDiff + ')');

// reef fish and crab use the edited drawing (every pixel magenta)
const magenta = (key) => G((key) => {
  const g = window.game.scene.getScene('Game'); const tex = g.textures.get(key); if (!tex || tex.key === '__MISSING') return -1;
  const src = tex.getSourceImage(); const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0); const d = x.getImageData(0, 0, src.width, src.height).data;
  let painted = 0, other = 0;
  for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) painted++; else other++; }
  return painted > 0 && other === 0 ? 1 : 0;
}, key);
await waitFor(() => window.game.scene.getScene('Game').textures.exists('look_fish-blue_tang'), undefined, 20000);
ok((await magenta('look_fish-blue_tang')) === 1, 'the blue tang in the game uses the studio drawing');
const tangFps = await G(() => { const g = window.game.scene.getScene('Game'); const c = g.creatures.find((c) => c.fish.species.id === 'blue_tang' || c.fish.texture.key === 'look_fish-blue_tang'); return c?.fish.skinFrames?.fps?.swim; });
ok(tangFps === 12, 'the studio swim speed reaches the game: ' + tangFps + ' fps');
await G(() => { const g = window.game.scene.getScene('Game'); g.spawnCrab(10); });
await waitFor(() => window.game.scene.getScene('Game').textures.exists('look_crab-checkpoint'), undefined, 10000);
ok((await magenta('look_crab-checkpoint')) === 1, 'the checkpoint crab uses the studio drawing');

// 5. Sprite Studio card lists every design
await G(() => { window.game.scene.getScene('Game').scene.restart(); });
await p.goto(base);
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#cardStudio');
const links = await G(() => [...document.querySelectorAll('#panel a.btn')].map((a) => a.getAttribute('href')));
for (const id of ['croc-hatchling', 'mosa-adult', 'white_shark-juvenile', 'fish-blue_tang', 'crab-checkpoint', 'fish-barracuda']) ok(links.some((h) => h.endsWith('project=' + id)), 'studio picker links to ' + id);
ok(!links.some((h) => /project=(crocodile|mosa|white_shark)$/.test(h)), 'no hero species ids in the reef list');

// following a link opens that drawing
await p.click(`#panel a[href$="project=fish-lionfish"]`);
await waitFor(() => location.pathname.includes('studio') && document.getElementById('projName').value.toLowerCase().includes('lion'));
ok((await p.inputValue('#projName')).toLowerCase().includes('lion'), 'the link opens the lionfish drawing');

// 6. Try in game
await p.goto(base + 'index.html?try=croc-hatchling&pose=0');
const tried = await waitFor(() => { const g = window.game?.scene.getScene('Game'); return g?.player && !g.menuMode && g.player.texture.key === 'skin_croc-hatchling'; });
ok(tried, 'Try in game plays the drawing');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
