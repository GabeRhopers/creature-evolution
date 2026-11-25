// Save slots and players: a new run goes to an empty slot, slots keep separate runs, rename (kept after
// reload), delete with a confirm step, Continue follows the chosen slot; every creature has its own 5 slots;
// each player (Who's playing?) has their own games and records; saves from before players move to player 1.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const lv = ()=>G(()=>window.game.scene.getScene('Game').player.level);
const goHome = async ()=>{ await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(1200); };
const slot = (n, hero='crocodile', pl=1)=>G(([n,hero,pl])=>{const r=localStorage.getItem(`ce.save.run.p${pl}.${hero}.${n}`); return r?JSON.parse(r).data:null;}, [n,hero,pl]);

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
ok(rows.length===5 && rows[1].on && rows[0].sub.includes('level 7') && rows[1].sub.includes('level 12') && rows[2].sub==='Empty', 'five slots listed, slot 2 in use, slot 3 empty');

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
await goHome();

// Every creature has its own slots: picking Mosa shows Mosa's (empty) games, the croc's stay.
await p.click('[data-hero="mosa"]'); await p.waitForTimeout(300);
ok(await G(()=>document.getElementById('btnContinue').hidden), 'Mosa has no saved run yet, so no CONTINUE');
await p.click('#cardSaves'); await p.waitForTimeout(300);
ok((await p.textContent('#savesTitle')).includes('Mosa games'), 'Saved games shows the picked creature: '+await p.textContent('#savesTitle'));
ok(await G(()=>[...document.querySelectorAll('.slot .slot-sub')].every(e=>e.textContent==='Empty')), "Mosa's five slots are empty");
await p.click('.slot[data-slot="1"] [data-act="new"]');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.species.id==='mosa';}, 8000), 'a new Mosa game starts');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(4); g.checkpoint(true);});
ok((await slot(1,'mosa'))?.level===4 && (await slot(1))?.level===8, "Mosa's run saves in Mosa's slot 1; the croc's slot 1 is untouched");
await goHome();
await p.click('#cardSaves'); await p.waitForTimeout(300);
await p.click('[data-tab="crocodile"]'); await p.waitForTimeout(300);
ok((await p.textContent('#savesTitle')).includes('Croc games') && (await G(()=>document.querySelector('[data-hero="crocodile"]').getAttribute('aria-pressed')))==='true', 'the creature tabs switch the list and the picked creature');
await p.click('#pClose');
ok((await p.textContent('#continueSub')).startsWith('Game 3:'), 'back on the croc, CONTINUE is its last game again: '+await p.textContent('#continueSub'));

// Players: add Mike; he starts fresh (no runs, no record), and Player 1's games stay.
await p.click('#btnPlayer'); await p.waitForTimeout(300);
ok(await G(()=>document.querySelectorAll('.player-row[data-player]').length===1), "Who's playing? lists one player on a new device");
await p.fill('#newPlayer', 'Mike');
await Promise.all([p.waitForNavigation(), p.click('#pAdd')]); await p.waitForTimeout(3500);
ok((await p.textContent('#playerName'))==='Mike', 'adding a player switches to them');
ok(await G(()=>document.getElementById('btnContinue').hidden), 'Mike has no saved runs');
await p.click('#btnPlay'); await p.waitForTimeout(1500);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(2); g.checkpoint(true);});
ok((await slot(1,'crocodile',2))?.level===2 && (await slot(1))?.level===8, "Mike's run saves under player 2; Player 1's run is untouched");
await goHome();
// Rename Player 1 and switch back to them.
await p.click('#btnPlayer'); await p.waitForTimeout(300);
await p.click('.player-row[data-player="1"] [data-act="rename"]');
await p.fill('.player-row[data-player="1"] input', 'Dad'); await p.press('.player-row[data-player="1"] input', 'Enter'); await p.waitForTimeout(300);
ok((await p.textContent('.player-row[data-player="1"] .pname'))==='Dad', 'rename a player');
await Promise.all([p.waitForNavigation(), p.click('.player-row[data-player="1"] [data-act="pick"]')]); await p.waitForTimeout(3500);
ok((await p.textContent('#playerName'))==='Dad' && (await p.textContent('#continueSub')).startsWith('Game 3:'), "switching back to Dad brings back his picked creature and run");
// Delete Mike (with a confirm step): his games go too.
await p.click('#btnPlayer'); await p.waitForTimeout(300);
await p.click('.player-row[data-player="2"] [data-act="delete"]');
ok((await slot(1,'crocodile',2))!==null, 'deleting a player asks first');
await p.click('.player-row[data-player="2"] [data-act="yes"]'); await p.waitForTimeout(300);
ok((await slot(1,'crocodile',2))===null && await G(()=>document.querySelectorAll('.player-row[data-player]').length===1), "deleting Mike removes him and his games");
await p.click('#pClose');

// Saves from before players: the old shared slots move to player 1, each into its own creature's slots.
// (Real envelopes the game wrote are moved back to the old keys; the checksum covers only the data.)
await G(()=>{
  const croc=localStorage.getItem('ce.save.run.p1.crocodile.1'), mosa=localStorage.getItem('ce.save.run.p1.mosa.1');
  for (const k of Object.keys(localStorage)) if (k.startsWith('ce.save.run') || k.startsWith('ce.save.players')) localStorage.removeItem(k);
  localStorage.setItem('ce.save.checkpoint', croc); localStorage.setItem('ce.save.checkpoint.2', mosa);
});
await p.reload(); await p.waitForTimeout(3500);
ok((await slot(1))?.level===8 && (await slot(1,'mosa'))?.level===4, 'old saves moved: the croc run to the croc slot 1, the Mosa run to the Mosa slot 1');
ok(await G(()=>localStorage.getItem('ce.save.checkpoint')===null && localStorage.getItem('ce.save.checkpoint.2')===null), 'the old keys are gone');
ok((await p.textContent('#playerName'))==='Player 1', 'and they belong to Player 1');
console.log('errors', errs); await b.close();
