// Sprite Studio "New skin" -> game, end to end, on a fresh device (no cloud):
//  1. The game's "+ New skin" link opens the studio's skin maker for the picked hero.
//  2. Uploading Rhopers' Fang sheet finds the four poses, guesses swim/bite/hurt and which way they face.
//  3. Make the skin with a golden version: two sets of three designs (hatchling, juvenile, adult) are saved,
//     tagged with skinOf, and the adult opens in the editor.
//  4. A color version of the current look (Mosa, dark) is saved the same way.
//  5. The home screen lists the skins under the hero; picking one dresses the hero in the run, at every stage,
//     and Original brings the shipped look back.
import { chromium } from 'playwright-core';
import path from 'path';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const base = 'http://localhost:4173/';
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const skinIds = () => G(() => Object.keys(localStorage).filter((k) => k.startsWith('spritestudio:sk-')).map((k) => k.slice(13)).sort());

await p.goto(base);
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player && document.getElementById('home').classList.contains('open'));

// 1. the link under the hero picker
await p.click('[data-hero="fang"]');
await waitFor(() => !!document.querySelector('#lookPick a.new'));
const href = await p.getAttribute('#lookPick a.new', 'href');
ok(/newskin=fang$/.test(href), 'the home screen links to a new Fang skin: ' + href);
ok((await G(() => document.querySelectorAll('#lookPick [data-look]').length)) === 1, 'only Original before any skin is made');
await p.click('#lookPick a.new');
await waitFor(() => document.getElementById('skHero')?.value === 'fang');
ok((await p.inputValue('#skHero')) === 'fang', 'the studio opens the skin maker with Fang picked');

// 2. upload the sheet
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#skPic')]);
await chooser.setFiles(path.join(HERE, '../../tools/fang/fang_sheet.jpg'));
await waitFor(() => document.querySelectorAll('.sktile').length > 0);
const tiles = await G(() => [...document.querySelectorAll('[data-pose]')].map((s) => s.value));
ok(tiles.length === 4, 'four poses found on the sheet: ' + tiles.length);
ok(JSON.stringify(tiles) === JSON.stringify(['move', 'move', 'attack', 'damage']), 'poses guessed: ' + tiles.join(', '));
const flips = await G(() => [...document.querySelectorAll('[id^=skc]')].map((c) => c.style.transform === 'scaleX(-1)'));
ok(JSON.stringify(flips) === JSON.stringify([true, true, true, false]), 'the left-facing poses are turned around: ' + flips.join(', '));
await waitFor(() => document.getElementById('skPrevJ').width > 0);
ok(!(await p.isDisabled('#skMake')), 'the preview is built and the skin can be made');

// 3. make it, with a golden version
await p.fill('#skName', 'Mike Fang');
await p.check('[data-variant="golden"]');
await p.click('#skMake');
await waitFor(() => /Mike Fang/.test(document.getElementById('projName').value));
const ids = await skinIds();
ok(ids.length === 6, 'two sets of three designs saved: ' + ids.join(' '));
const adult = await G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id)), ids.find((i) => /^sk-[a-z0-9]+-adult$/.test(i)));
ok(adult?.skinOf?.hero === 'fang' && adult.skinOf.stage === 'adult' && adult.framework === 'fang', 'designs are tagged for Fang on its framework');
ok((await p.inputValue('#projName')).startsWith('Mike Fang'), 'the new skin opens in the editor for adjusting');
const golden = await G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id)), ids.find((i) => /-g-adult$/.test(i)));
ok(golden?.skinOf?.name === 'Mike Fang (Golden)' && golden.palette.join() !== adult.palette.join(), 'the golden version has its own colors');
const hatch = await G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id)), ids.find((i) => /^sk-[a-z0-9]+-hatchling$/.test(i)));
ok(hatch.palette.includes('#ead4aa'), 'the hatchling is inside a beige egg');

// an edit in the studio keeps the skin tag
await p.locator('[data-tool=pencil]').click();
const box = await p.locator('#cv').boundingBox();
await p.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2);
await waitFor((id) => JSON.parse(localStorage.getItem('spritestudio:' + id)).updatedAt !== JSON.parse(localStorage.getItem('spritestudio:' + id + '-x') || '{}').updatedAt && JSON.parse(localStorage.getItem('spritestudio:' + id)).updatedAt > '2026-11-25', ids.find((i) => /^sk-[a-z0-9]+-adult$/.test(i)));
await p.waitForTimeout(1500);
const edited = await G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id)), ids.find((i) => /^sk-[a-z0-9]+-adult$/.test(i)));
ok(edited.skinOf?.hero === 'fang', 'editing a skin design keeps it in the skin');

// 4. a color version of Mosa's current look
await p.click('#btnSkin');
await p.selectOption('#skHero', 'mosa');
await p.click('#skColor');
await waitFor(() => !!document.querySelector('[data-variant="dark"]'));
await p.uncheck('[data-variant="golden"]');
await p.check('[data-variant="dark"]');
await p.fill('#skName', 'Night Mosa');
await p.click('#skMake');
await waitFor(() => /Night Mosa/.test(document.getElementById('projName').value));
const mosaIds = (await skinIds()).filter((i) => !ids.includes(i));
ok(mosaIds.length === 3 && mosaIds.every((i) => /-d-(hatchling|juvenile|adult)$/.test(i)), 'the dark Mosa skin: ' + mosaIds.join(' '));

// 5. pick the skin on the home screen and swim with it
await p.goto(base);
await waitFor(() => window.game?.scene.getScene('Game')?.player && document.getElementById('home').classList.contains('open'));
await p.click('[data-hero="fang"]');
await waitFor(() => document.querySelectorAll('#lookPick [data-look]').length === 3);
const chips = await G(() => [...document.querySelectorAll('#lookPick [data-look]')].map((x) => x.textContent));
ok(JSON.stringify(chips) === JSON.stringify(['Original', 'Mike Fang', 'Mike Fang (Golden)']), 'Fang lists its skins: ' + chips.join(', '));
const set = ids.find((i) => /^sk-[a-z0-9]+-adult$/.test(i)).replace(/-adult$/, '');
await p.click(`#lookPick [data-look="${set}"]`);
await waitFor((s) => document.querySelector(`#lookPick [data-look="${s}"]`)?.getAttribute('aria-pressed') === 'true', set);
const saved = await G(() => JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.looks);
ok(saved?.fang === set, 'the pick is saved in the profile');
await p.waitForTimeout(500);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
const key1 = await G(() => window.game.scene.getScene('Game').player.texture.key);
ok(key1 === `skin_${set}-hatchling`, 'the hatchling wears the skin: ' + key1);
await G(() => window.addEventListener('ce:perk', () => setTimeout(() => document.querySelector('[data-perk]')?.click(), 30)));
for (const lv of [11, 21]) {
  await G((lv) => { const g = window.game.scene.getScene('Game'); g.player.setLevel(lv - 1); g.grantXp(g.player.xpNeeded + 1); }, lv);
  await waitFor((lv) => window.game.scene.getScene('Game').player.level === lv, lv, 8000);
  await waitFor(() => window.game.scene.getScene('Game').evolveLock <= 0, undefined, 20000);
  if (lv === 11) ok((await G(() => window.game.scene.getScene('Game').player.texture.key)) === `skin_${set}-juvenile`, 'the juvenile wears the skin');
}
await waitFor((s) => window.game.scene.getScene('Game').player.texture.key === `skin_${s}-adult`, set, 10000);
const k2 = await G(() => { const g = window.game.scene.getScene('Game'); return [g.player.texture.key, g.player.level, g.player.stage?.id, g.evolveLock]; });
ok(k2[0] === `skin_${set}-adult`, 'the adult wears the skin too: ' + k2.join(' '));
// the edited pixel reached the game (the adult texture matches the studio design)
const diff = await G((id) => {
  const g = window.game.scene.getScene('Game'); const pl = g.player; const tex = pl.texture; const src = tex.getSourceImage();
  const proj = JSON.parse(localStorage.getItem('spritestudio:' + id));
  const fr = tex.get(pl.skinFrames.idle[0]);
  const c = document.createElement('canvas'); c.width = proj.w; c.height = proj.h; const x = c.getContext('2d');
  x.drawImage(src, fr.cutX, fr.cutY, proj.w, proj.h, 0, 0, proj.w, proj.h);
  const d = x.getImageData(0, 0, proj.w, proj.h).data; const ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const f = proj.poses.find((q) => q.name === 'idle').frames[0]; let n = 0;
  for (let i = 0; i < proj.w * proj.h; i++) { const ch = f[i]; if (ch === '.') { if (d[i * 4 + 3]) n++; continue; }
    const hx = '#' + [0, 1, 2].map((k) => d[i * 4 + k].toString(16).padStart(2, '0')).join(''); if (hx !== proj.palette[ALPH.indexOf(ch)].toLowerCase()) n++; }
  return n;
}, set + '-adult');
ok(diff === 0, 'the adult in the game matches the studio design (pixels different: ' + diff + ')');

// Original brings the shipped look back
await G(() => window.game.scene.getScene('Game').goHome());
await waitFor(() => document.getElementById('home').classList.contains('open'));
await p.click('#lookPick [data-look=""]');
await p.waitForTimeout(800);
ok((await G(() => JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.looks)) === undefined, 'Original clears the pick');
await p.click('#btnPlay');
await p.waitForTimeout(400);
await G(() => document.getElementById('pNew')?.click());
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode && g.player.level === 1; });
const key2 = await G(() => window.game.scene.getScene('Game').player.texture.key);
ok(key2 === 'stage_fang_hatchling', 'back to the original Fang: ' + key2);

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
