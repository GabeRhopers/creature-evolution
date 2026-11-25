// Twilight Trench creatures: lanternfish schools, viperfish, gulper eels and vampire squid unlock in Tide 5 and live
// only in the Trench; glowing ones glow; a scared vampire squid puffs a glowing cloud that blinds the player.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('STACK', e.stack);});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 30000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 30000);
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); window.__new=[]; const h=window.game.scene.getScene('Hud'); const f=h.bigBanner.bind(h); h.bigBanner=(t,l)=>{window.__new.push(t); f(t,l);};});
ok(await G(()=>!window.game.scene.getScene('Game').creatures.some(c=>['lanternfish','viperfish','gulper_eel','vampire_squid'].includes(c.fish.species.id))), 'no Trench creatures before level 40');

// Grow to level 45: all four unlock with a NEW banner each.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(44); g.grantXp(g.player.xpNeeded+1); g.player.invulnTimer=1e9;});
ok(await waitFor(()=>['lanternfish','viperfish','gulper_eel','vampire_squid'].every(id=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id)), 15000), 'all four join the sea after level 40');
ok(await G(()=>window.game.scene.getScene('Game').creatures.filter(c=>['lanternfish','viperfish','gulper_eel','vampire_squid'].includes(c.fish.species.id)).every(c=>{const g=window.game.scene.getScene('Game'); return g.regions.at(c.homeX ? c.homeX() : c.fish.x).id==='trench';})), 'they all call the Trench home');

// Swim into the Trench.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(78000, 1900); g.cameras.main.centerOn(78000, 1900);});
ok(await waitFor(()=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id==='lanternfish' && !c.asleep && !c.away), 15000), 'lanternfish are awake around you');

// A lanternfish nearby glows.
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='lanternfish' && !c.asleep && !c.away); c.fish.setPosition(g.player.x+220, g.player.y);});
ok(await waitFor(()=>window.game.scene.getScene('Light').glows.some(d=>d.visible && d.tintTopLeft===0x2ce8f5), 8000), 'glowing fish glow in the dark');
await p.screenshot({path:'/tmp/trench_life.png'});

// Scare a vampire squid: it puffs a glowing cloud, you are blinded, it flees.
const squid = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='vampire_squid' && !c.asleep && !c.away) || g.creatures.find(c=>c.fish.species.id==='vampire_squid');
  c.away=false; c.respawnT=0; c.cloudT=0; c.fish.setPosition(g.player.x+g.player.size+c.fish.size, g.player.y); return g.creatures.indexOf(c);});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); if (!(g.blindT > 0)) return false;
  window.__puffer = g.creatures.findIndex(c=>c.fish.species.id==='vampire_squid' && c.cloudT > 0); return true;}, 8000), 'a scared vampire squid blinds you with its glowing cloud');
ok(await waitFor(()=>window.game.scene.getScene('Light').glare.alpha > 0.2, 3000), 'the screen glows blue');
await p.screenshot({path:'/tmp/trench_blind.png'});
// The squid that puffed (its partner may have been closer) is the one waiting to puff again.
// (Found the moment you were blinded: on a slow machine its cooldown may be over by now.)
const puffer = await G(()=>window.__puffer ?? -1);
// It treats you as the threat (it may already have escaped and calmed down on a slow machine).
ok(puffer >= 0 && await waitFor((i)=>{const g=window.game.scene.getScene('Game'); const br=g.creatures[i].brain; const f=g.creatures[i].fish, pl=g.player; return br.state==='flee' || br.threat===g.playerCreature || Math.hypot(f.x-pl.x, f.y-pl.y) > (f.size+pl.size)*2;}, 8000, puffer), 'and the squid flees');
const b0 = await G(()=>window.game.scene.getScene('Game').blindT);
await p.waitForTimeout(1500);
ok(await G((b0)=>window.game.scene.getScene('Game').blindT < b0, b0), 'the glare wears off');
const cd = await G((i)=>{const c=window.game.scene.getScene('Game').creatures[i]; return {t:c.cloudT, id:c.fish.species.id, asleep:c.asleep};}, puffer);
ok(cd.t > 0, 'it needs time before it can puff again: '+JSON.stringify(cd));

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
console.log('errors', JSON.stringify(errs.slice(0,3)));
await b.close();
