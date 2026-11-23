// Crowd control: a level 56 shark in the Mangrove Swamp at dusk (the busy screen from Nov 23) now sees a calm,
// readable sea: a capped number of awake fish around it, at most 3 hunters, and most of the tiny prey hidden.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('STACK', e.stack);});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 30000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 30000);

const cfg = await G(()=>window.game.scene.getScene('Game').constructor && JSON.parse(JSON.stringify(window.game.scene.getScene('Game').crowdFactors)));
ok(cfg.swamp < 1 && cfg.kelp === 1, 'busy regions are thinned, quiet ones are not: ' + JSON.stringify(cfg));

await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); g.player.setLevel(55); g.grantXp(g.player.xpNeeded+1); g.player.invulnTimer=1e9;});
await p.waitForTimeout(3000);
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(30500, 700); g.cameras.main.centerOn(30500, 700);});
await p.waitForTimeout(6000);
const s = await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; const R=window.game.scene.getScene('Game').constructor; 
  const near = g.creatures.filter(c=>c.brain && !c.isPlayer && !c.asleep && Math.hypot(c.fish.x-pl.x, c.fish.y-pl.y) < 1800);
  const hunters = g.creatures.filter(c=>c.brain && !c.asleep && c.brain.state==='hunt' && c.brain.target===g.playerCreature).length;
  const archers = g.creatures.filter(c=>c.fish.species.id==='archerfish'); const archOut = archers.filter(c=>!c.away).length;
  return { near: near.length, hunters, archers: archers.length, archOut };});
console.log(JSON.stringify(s));
ok(s.near <= 34, `few enough awake fish around you (${s.near} within 1800 px)`);
ok(s.hunters <= 3, `at most 3 hunt you at once (${s.hunters})`);
ok(s.archOut < s.archers * 0.6, `most of the tiny archerfish hide from a level 56 giant (${s.archOut} of ${s.archers} out)`);
await p.screenshot({path:'/tmp/crowd_swamp.png'});

// Back at level 12 in the swamp, the archerfish are all out again (they matter to a juvenile).
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(12);});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); const a=g.creatures.filter(c=>c.fish.species.id==='archerfish'); return a.filter(c=>!c.away).length > a.length*0.8;}, 8000), 'for a juvenile the archerfish are all out');

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
