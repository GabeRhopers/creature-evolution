// New enemies that join the reef at higher levels: lionfish (6), moray eel (14), barracuda (22).
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const count = (id)=>G((id)=>window.game.scene.getScene('Game').creatures.filter(c=>c.brain&&c.fish.species.id===id).length, id);
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 8000, level); };

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
ok(await count('lionfish')===0 && await count('barracuda')===0, 'the home screen ocean has no new enemies');
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__news=[]; const f=h.newCreature.bind(h); h.newCreature=(n,i)=>{window.__news.push(n); f(n,i);};});
await p.click('#btnPlay'); await p.waitForTimeout(1500);
ok(await count('lionfish')===0 && await count('moray_eel')===0 && await count('barracuda')===0, 'a new run starts without them');

await grow(6);
ok(await waitFor(()=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id==='lionfish'), 5000), 'lionfish join the reef at level 6: '+await count('lionfish'));
ok(await waitFor(()=>window.__news.includes('Lionfish'), 8000), 'with a NEW banner');
ok(await count('moray_eel')===0, 'no moray yet');

// venom: biting a lionfish stings
const sting = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; pl.hp=pl.maxHp; pl.invulnTimer=0; const c=g.creatures.find(c=>c.fish.species.id==='lionfish'); pl.biteCooldown=0; const h0=pl.hp; g.bite(g.playerCreature,c); return (h0-pl.hp)/pl.maxHp;});
ok(Math.abs(sting-0.06)<0.01, 'biting a lionfish costs about 6% of your health: '+sting.toFixed(3));

await grow(14);
ok(await waitFor(()=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id==='moray_eel'), 5000), 'moray eels join at level 14: '+await count('moray_eel'));
// ambush: a moray that spots the player lunges at once
const lunge = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; const c=g.creatures.find(c=>c.fish.species.id==='moray_eel');
  c.fish.setPosition(pl.x-150, pl.y); c.fish.arcadeBody.setVelocity(0,0); c.fish.stamina=100; c.fish.dashCooldown=0; c.brain.hunger=0.1;
  c.brain.target=g.playerCreature; c.brain.state='hunt'; c.brain.stateTime=0; c.brain.lunged=false; c.brain.think(0.016);
  return {cd:c.fish.dashCooldown, lunged:c.brain.lunged};});
ok(lunge.lunged && lunge.cd>0, 'a moray lunges when it starts a hunt: '+JSON.stringify(lunge));

await grow(22);
ok(await waitFor(()=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id==='barracuda'), 5000), 'barracuda packs join at level 22: '+await count('barracuda'));
ok(await waitFor(()=>window.__news.includes('Barracuda'), 8000), 'with a NEW banner');

// a saved run at level 15 continues with lionfish and morays already there
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(15); g.checkpoint(true);});
await p.reload(); await p.waitForTimeout(3500);
await p.click('#btnContinue');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.level===15;}, 8000), 'continued at level 15');
ok(await count('lionfish')>0 && await count('moray_eel')>0 && await count('barracuda')===0, 'with lionfish and morays, no barracuda yet');
console.log('errors', errs); await b.close();
