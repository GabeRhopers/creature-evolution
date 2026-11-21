// Save slots: an old save becomes slot 1, a new run goes to an empty slot, slots keep separate runs,
// rename (kept after reload), delete with a confirm step, and Continue follows the chosen slot.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const lv = ()=>G(()=>window.game.scene.getScene('Game').player.level);
const goHome = async ()=>{ await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(1200); };
const slot = (n)=>G((n)=>{const r=localStorage.getItem(n===1?'ce.save.checkpoint':'ce.save.checkpoint.'+n); return r?JSON.parse(r).data:null;}, n);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));

// a run in slot 1 (the original save key)
await p.click('#btnPlay'); await p.waitForTimeout(1500);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(7); g.checkpoint(true);});
await goHome();
ok((await slot(1))?.level===7, 'the first run saves in slot 1 (the original save key, so older saves just work)');
ok((await p.textContent('#continueSub')).startsWith('Game 1:'), 'Continue names the slot: '+await p.textContent('#continueSub'));

// NEW RUN offers an empty slot instead of replacing
await p.click('#btnPlay'); await p.waitForTimeout(400);
ok(await G(()=>!!document.getElementById('pEmpty')), 'NEW RUN offers to start in an empty slot');
await p.click('#pEmpty'); await p.waitForTimeout(1500);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(12); g.checkpoint(true);});
await goHome();
ok((await slot(1))?.level===7 && (await slot(2))?.level===12, 'slot 1 kept its run; the new run is in slot 2');

// Saved games panel: three slots, the one in use marked
await p.click('#cardSaves'); await p.waitForTimeout(300);
const rows = await G(()=>[...document.querySelectorAll('.slot')].map(s=>({n:s.dataset.slot, on:s.classList.contains('on'), sub:s.querySelector('.slot-sub').textContent})));
console.log(JSON.stringify(rows));
ok(rows.length===3 && rows[1].on && rows[0].sub.includes('level 7') && rows[1].sub.includes('level 12') && rows[2].sub==='Empty', 'three slots listed, slot 2 in use, slot 3 empty');

// rename slot 1, kept after reload
await p.click('.slot[data-slot="1"] [data-act="rename"]');
await p.fill('.slot[data-slot="1"] .slot-input', "Mike's reef");
await p.press('.slot[data-slot="1"] .slot-input', 'Enter'); await p.waitForTimeout(200);
ok((await p.textContent('.slot[data-slot="1"] .slot-name'))==="Mike's reef", 'rename a slot');

// continue slot 1 from the panel
await p.click('.slot[data-slot="1"] [data-act="continue"]');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.level===7;}, 8000), 'Continue in the panel loads that slot (level 7)');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(8); g.checkpoint(true);});
await goHome();
ok((await slot(1))?.level===8 && (await slot(2))?.level===12, 'playing slot 1 writes only to slot 1');

await p.reload(); await p.waitForTimeout(3500);
ok((await p.textContent('#continueSub')).startsWith("Mike's reef:"), 'after reload, the chosen slot and its name are kept: '+await p.textContent('#continueSub'));

// delete slot 2 with a confirm step
await p.click('#cardSaves'); await p.waitForTimeout(300);
await p.click('.slot[data-slot="2"] [data-act="delete"]');
ok((await slot(2))!==null, 'delete asks first (nothing deleted yet)');
await p.click('.slot[data-slot="2"] [data-act="yes"]'); await p.waitForTimeout(200);
ok((await slot(2))===null && (await slot(1))?.level===8, 'delete removes only that slot');
ok((await p.textContent('.slot[data-slot="2"] .slot-sub'))==='Empty', 'and the list shows it empty');

// New game in an empty slot starts right away there
await p.click('.slot[data-slot="3"] [data-act="new"]');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.level===1;}, 8000), 'New game in an empty slot starts a run');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(3); g.checkpoint(true);});
ok((await slot(3))?.level===3 && (await slot(1))?.level===8, 'it saves in slot 3');
console.log('errors', errs); await b.close();
