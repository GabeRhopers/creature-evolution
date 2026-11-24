// Sprite Studio: bring back the original (shipped) animation of one pose, or the whole drawing.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };
const ID = 'white_shark-adult';
const local = () => G((id) => JSON.parse(localStorage.getItem('spritestudio:' + id) || 'null'), ID);

await p.goto('http://localhost:4173/studio/index.html');
await G(() => localStorage.clear());
await p.goto('http://localhost:4173/studio/index.html?project=' + ID);
const seed = await G((id) => fetch('seeds/' + id + '.json').then((r) => r.json()), ID);
await waitFor((n) => document.getElementById('projName').value === n, seed.name);
ok(!(await G(() => document.getElementById('origPose').hidden)), 'starter designs show an Original button');

// Open the attack pose and clear its first frame (an edit).
const attackTab = await G(() => [...document.querySelectorAll('#poses button')].findIndex((b) => b.textContent.toLowerCase().startsWith('attack')));
await p.locator('#poses button').nth(attackTab).click();
await p.click('#clearBtn');
await waitFor(() => { const v = JSON.parse(localStorage.getItem('spritestudio:white_shark-adult') || 'null'); const a = v?.poses.find((po) => po.name.toLowerCase() === 'attack'); return a && !/[^.]/.test(a.frames[0]); });
const edited = await local();
const atk = (d) => d.poses.find((po) => po.name.toLowerCase() === 'attack');
ok(!/[^.]/.test(atk(edited).frames[0]), 'the attack frame was cleared (edited)');

// Original > only this pose.
await p.click('#origPose');
await p.click('#orPose');
await waitFor((want) => { const v = JSON.parse(localStorage.getItem('spritestudio:white_shark-adult') || 'null'); const a = v?.poses.find((po) => po.name.toLowerCase() === 'attack'); return a && a.frames[0] === want; }, atk(seed).frames[0]);
const restored = await local();
ok(atk(restored).frames.join('|') === atk(seed).frames.join('|'), 'the original attack animation is back');
const idle = (d) => d.poses.find((po) => po.name.toLowerCase() === 'idle');
ok(idle(restored).frames.join('|') === idle(edited).frames.join('|'), 'the other poses were left alone');

// Undo brings the edit back.
await p.keyboard.press('Control+z');
ok(await waitFor(() => { const v = JSON.parse(localStorage.getItem('spritestudio:white_shark-adult') || 'null'); const a = v?.poses.find((po) => po.name.toLowerCase() === 'attack'); return a && !/[^.]/.test(a.frames[0]); }), 'undo works after restoring');

// Original > whole drawing: identical to the shipped design, and it counts as untouched again.
await p.click('#origPose');
await p.click('#orAll');
ok(await waitFor((want) => { const v = JSON.parse(localStorage.getItem('spritestudio:white_shark-adult') || 'null'); return v && v.poses.map((po) => po.frames.join('|')).join('/') === want; }, seed.poses.map((po) => po.frames.join('|')).join('/')), 'the whole original drawing is back');
await p.waitForTimeout(1500);
ok((await local()).updatedAt === seed.updatedAt, 'restored drawings keep the shipped stamp (they still get future updates)');

// A project that is not a starter has no Original button.
await G(() => localStorage.setItem('spritestudio:pmine', JSON.stringify({ name: 'Mine', w: 16, h: 16, palette: ['#000000', '#ffffff'], poses: [{ name: 'idle', fps: 4, frames: ['1'.repeat(256)] }], updatedAt: new Date().toISOString() })));
await p.goto('http://localhost:4173/studio/index.html?project=pmine');
await waitFor(() => document.getElementById('projName').value === 'Mine');
ok(await G(() => document.getElementById('origPose').hidden), 'your own drawings have no Original button');
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
