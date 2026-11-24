// Tides and endless levels: the HUD names the Tide, a banner starts each new Tide, levels go past 30
// as Legend levels (adult body, growing strength, a perk every 3 levels), and reef fish spawn higher.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
// skipCrab: count that level's crab as beaten, so crabs don't get in the way of these jumps.
const grow=async(level, skipCrab=true)=>{ await G(([lv,skip])=>{const g=window.game.scene.getScene('Game'); if (skip) g.crabLevel=lv; g.player.setLevel(lv-1); g.grantXp(g.player.xpNeeded+1);}, [level, skipCrab]);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 8000, level); };
const info = ()=>G(()=>window.game.scene.getScene('Hud').info.text);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__tides=[]; const f=h.newTide.bind(h); h.newTide=(t,n)=>{window.__tides.push(t+' '+n); f(t,n);};});
await p.click('#btnPlay'); await p.waitForTimeout(1500);
ok((await info()).startsWith('Tide 1 '), 'the HUD shows Tide 1: '+(await info()).slice(0,40));

await grow(11);
ok(await waitFor(()=>window.__tides.includes('2 Kelp Forest'), 45000), 'reaching level 11 starts Tide 2: Kelp Forest, with a banner');
ok((await info()).startsWith('Tide 2 '), 'the HUD shows Tide 2');

// reef fish that respawn in a later Tide come back stronger
await grow(35);
const lv = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.brain&&c.fish.species.id==='blue_tang'); g['respawnAmbient'](c); return c.fish.level;});
ok(lv>=4 && lv<=6, 'in Tide 4, a respawned blue tang is level 4 to 6 (1 to 3, +3): '+lv);
const s = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; return {lv:pl.level, stage:pl.stage.id, size:pl.size, rank:pl.rank};});
const s30 = await G(()=>{const g=window.game.scene.getScene('Game'); const pl=g.player; const l=pl.level; pl.setLevel(30); const r={size:pl.size, rank:pl.rank}; pl.setLevel(l); return r;});
ok(s.lv===35 && s.stage==='adult', 'level 35: past the old cap, still an adult');
ok(Math.abs(s.size-s30.size)<1e-6 && s.rank>s30.rank*1.1, 'Legend levels: same adult body, stronger than at 30');
ok((await info()).includes('Level 35 (Legend 5)'), 'the HUD names the Legend level: '+(await info()).slice(0,60));
ok(await waitFor(()=>window.game.scene.getScene('Game').perks.length>=7, 45000), 'Legend perks: a 7th perk by level 35 (from level 33)');

// the crab keeps coming every 10 levels past 30
await G(()=>{const g=window.game.scene.getScene('Game'); g.crabLevel=30;});
await grow(40, false);
ok(await waitFor(()=>!!window.game.scene.getScene('Game').crab, 15000), 'a Checkpoint Crab waits at the end of Tide 4 (level 40)');
console.log('errors', errs); await b.close();
