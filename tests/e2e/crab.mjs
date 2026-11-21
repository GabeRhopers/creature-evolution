// Checkpoint Crab: appears at level 10, can't be swallowed, takes about 14 bites, pinches,
// saves level 10 when defeated, and after dying the run restarts at level 10 (perks kept).
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 5000, level);
  await waitFor(()=>window.game.scene.getScene('Game').evolveLock<=0, 20000); };

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay'); await p.waitForTimeout(1500);

await grow(9);
await p.waitForTimeout(1200);
ok(await G(()=>!window.game.scene.getScene('Game').crab), 'no crab before level 10');
await grow(10);
ok(await waitFor(()=>!!window.game.scene.getScene('Game').crab, 15000), 'a Checkpoint Crab appears at level 10');
ok(await G(()=>window.game.scene.getScene('Hud').banner.text.includes('CHECKPOINT CRAB')), 'with a banner');
const c0 = await G(()=>{const g=window.game.scene.getScene('Game'),c=g.crab.fish,pl=g.player; return {hp:c.maxHp, bite:pl.biteDamage, armor:c.species.armor, size:c.size, psize:pl.size, depthOk: g.depthLimitY===null || c.y < g.depthLimitY + 1};});
console.log(JSON.stringify(c0));
ok(c0.size >= c0.psize, 'the crab is at least as big as you');
ok(c0.depthOk, 'it waits inside the water you may swim in');

// out of view: the HUD arrow points to it
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setPosition(g.crab.fish.x+1400, g.crab.fish.y-300); g.player.arcadeBody.setVelocity(0,0);});
ok(await waitFor(()=>window.game.scene.getScene('Hud').crabLabel.visible, 10000), 'an arrow points to the crab when it is off screen');

// it can't be swallowed, only bitten
await G(()=>{const g=window.game.scene.getScene('Game'),c=g.crab.fish; c.setLevel(1); c.maxHp=1e6; c.hp=1e6;}); // tiny: would be swallowable
await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player,c=g.crab.fish,m=pl.mouthPoint(); c.setPosition(m.x,m.y); c.arcadeBody.setVelocity(0,0);});
await p.waitForTimeout(300);
ok(await G(()=>window.game.scene.getScene('Game').mouthState!=='canSwallow'), 'the crab can never be swallowed');

// a fresh crab at full strength: count bites to defeat it
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.crab; g.creatures.splice(g.creatures.indexOf(c),1); c.fish.destroy(); g.crab=null;});
ok(await waitFor(()=>!!window.game.scene.getScene('Game').crab, 15000), 'the crab comes back until it is defeated');
const bites = await G(()=>{const g=window.game.scene.getScene('Game'); let n=0; while(g.crab && n<60){ g.player.biteCooldown=0; g.bite(g.playerCreature, g.crab); n++; } return n;});
console.log('bites to defeat:', bites);
ok(bites>=10 && bites<=20, `defeating it takes about 14 bites (${bites})`);
ok(await G(()=>window.game.scene.getScene('Game').crabLevel===10), 'level 10 is saved');
ok(await G(()=>window.game.scene.getScene('Hud').banner.text.includes('CHECKPOINT SAVED: LEVEL 10')), 'with a banner');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.crabLevel===10), 'and written to the save');
await p.waitForTimeout(1500);
ok(await G(()=>!window.game.scene.getScene('Game').crab), 'no new crab until level 20');

// the pinch: 12% of your health and a stun
await grow(14);
const pinch = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; return {max:pl.maxHp};});
await grow(20);
ok(await waitFor(()=>!!window.game.scene.getScene('Game').crab, 15000), 'the next crab appears at level 20');
const hit = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; pl.invulnTimer=0; pl.hp=pl.maxHp; const h0=pl.hp; g.bite(g.crab, g.playerCreature); return {lost:(h0-pl.hp)/pl.maxHp, stunned:pl.stunned};});
ok(Math.abs(hit.lost-0.12*(1-0.2))<0.03 && hit.stunned, `a pinch takes about 12% of your health and stuns: ${JSON.stringify(hit)}`);

// dying before the level 20 crab: back to level 10, perks kept
const perks = await G(()=>window.game.scene.getScene('Game').perks.length);
await G(()=>window.game.scene.getScene('Game').playerDied(null,'bitten'));
await p.waitForTimeout(1500);
ok((await G(()=>window.game.scene.getScene('Hud').deathAgain.text))==='SWIM AGAIN FROM LEVEL 10', 'the death screen offers level 10');
await G(()=>window.game.scene.getScene('Game').restartFromStage());
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.dead && g.player.level===10;}, 5000), 'swims again at level 10');
const perksAfter = await G(()=>window.game.scene.getScene('Game').perks.length);
ok(perksAfter>=perks && perks>=1, `perks kept (${perks} before, ${perksAfter} after)`);
await p.waitForTimeout(1500);
ok(await G(()=>!window.game.scene.getScene('Game').crab && window.game.scene.getScene('Game').crabLevel===10), 'the beaten crab does not come back');

// Continue keeps the crab level
await G(()=>window.game.scene.getScene('Game').checkpoint(true));
await p.reload(); await p.waitForTimeout(3500);
await p.click('#btnContinue');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.crabLevel===10;}, 5000), 'Continue keeps the crab level');

// a new run starts with no crab level
await G(()=>window.game.scene.getScene('Game').restartRun());
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.player.level===1 && g.crabLevel===0;}, 5000), 'a new run starts with no crab level');
console.log('errors', errs); await b.close();
