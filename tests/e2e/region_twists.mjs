// Region twists: the Swamp is murky (fish see less) with more food, the Volcanic Rift makes you hungry
// and its vents heal more, the Frozen Sea slows you and makes you hungry unless you warm up by a vent.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 20000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 15000);
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); g.player.setLevel(15); const h=window.game.scene.getScene('Hud'); window.__area=[]; const f=h.areaBanner.bind(h); h.areaBanner=(n,hint)=>{window.__area.push([n,hint]); f(n,hint);};});

// Perks change speed and hunger too: wait until every perk earned by level 15 is picked (none pending for 1.5 s).
for (let calm=0, t=0; calm<1500 && t<30000; t+=250) { await p.waitForTimeout(250); calm = (await G(()=>!window.game.scene.getScene('Game').perkPending && !document.querySelector('[data-perk]'))) ? calm+250 : 0; }

// Put the player in mid water at x, and wait until the game has seen the new region.
const goTo = async (x, region) => {
  await G((x)=>{const g=window.game.scene.getScene('Game'), pl=g.player; const y=g.terrain.surfaceY+260;
    pl.arcadeBody.reset(x, y); pl.invulnTimer=1e9; g.cameras.main.centerOn(x, y);}, x);
  return waitFor((r)=>{const g=window.game.scene.getScene('Game'); return g.region?.id===r && g.twistKey.startsWith(r+':');}, 8000, region);
};
const read = () => G(()=>{const g=window.game.scene.getScene('Game'); return {speed:g.player.mods.speed, hunger:g.stomach.hungerMul, food:g.food.density, vision:g.visionAt(g.player.x)};});

ok(await goTo(12000, 'coral'), 'in the Coral Sea');
const coral = await read();
ok(coral.vision === 1, `Coral Sea: normal vision (${coral.vision})`);

ok(await goTo(31000, 'swamp'), 'in the Mangrove Swamp');
const swamp = await read();
ok(swamp.vision < 1, `Swamp: fish see less (${swamp.vision})`);
ok(await waitFor((c)=>{const g=window.game.scene.getScene('Game'); return g.food.density > c * 1.3;}, 5000, coral.food), 'Swamp: more food drifts by');
ok(Math.abs(swamp.hunger - coral.hunger) < 1e-6 && Math.abs(swamp.speed - coral.speed) < 1e-6, 'Swamp: speed and hunger are normal');
ok(await waitFor(()=>window.__area.some(([n,h])=>n.includes('Swamp') && h.includes('Murky')), 3000), 'the Swamp banner explains the twist');

ok(await goTo(63000, 'volcano'), 'in the Volcanic Rift');
const rift = await read();
ok(rift.hunger > coral.hunger * 1.2, `Rift: hungrier (${(rift.hunger/coral.hunger).toFixed(2)}x)`);

ok(await goTo(106000, 'ice'), 'in the Frozen Sea');
const ice = await read();
ok(ice.speed < coral.speed * 0.95, `Frozen Sea: slower (${(ice.speed/coral.speed).toFixed(2)}x)`);
ok(ice.hunger > coral.hunger * 1.2, `Frozen Sea: hungrier (${(ice.hunger/coral.hunger).toFixed(2)}x)`);

// Warm up by a vent in the Frozen Sea: speed and hunger back to normal, and it heals more than a Coral vent.
const vent = await G(()=>{const g=window.game.scene.getScene('Game'); const v=g.vents.find(v=>g.regions.at(v.x).id==='ice'); return v ? {x:v.x, y:v.y, r:window.BALANCE?.scenery?.vent?.radius} : null;});
ok(!!vent, 'the Frozen Sea has a warm vent');
if (vent) {
  const at = await G((v)=>{const g=window.game.scene.getScene('Game'), pl=g.player; window.__hold=setInterval(()=>{pl.arcadeBody.reset(v.x, v.y-50); pl.arcadeBody.setVelocity(0,0);},16); g.cameras.main.centerOn(v.x, v.y); return true;}, vent);
  ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.inVent && g.twistKey==='ice:true';}, 8000), 'resting by the vent warms you up');
  const warm = await read();
  ok(Math.abs(warm.speed - coral.speed) < 1e-6 && Math.abs(warm.hunger - coral.hunger) < 1e-6, `by a vent the cold is gone (speed ${(warm.speed/coral.speed).toFixed(2)}x, hunger ${(warm.hunger/coral.hunger).toFixed(2)}x)`);
  await G(()=>clearInterval(window.__hold));
}
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.twistOf('volcano').ventHeal > 1 && g.twistOf('ice').ventHeal > 1 && g.twistOf('coral').ventHeal === 1;}), 'vents heal more in the Rift and the Frozen Sea');

// Sargasso Drift: the current carries you east when you hold still.
ok(await goTo(46000, 'sargasso'), 'in the Sargasso Drift');
// Slow machines run the game clock slower: compare with the game's own time.
const s0 = await G(()=>{const g=window.game.scene.getScene('Game'); return {x:g.player.x, t:g.runTime};});
await p.waitForTimeout(3000);
const s1 = await G(()=>{const g=window.game.scene.getScene('Game'); return {x:g.player.x, t:g.runTime};});
const drift = (s1.x - s0.x) / Math.max(0.01, s1.t - s0.t);
ok(drift > 25, `the current carries you east (${Math.round(drift)} px per game second)`);
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.kelpZones.filter(z=>g.regions.at(z.centerX).id==='sargasso' && z.y < g.terrain.surfaceY+200).length >= 10;}), 'floating weed mats are hiding places at the surface');

// Twilight Trench: dark around you, day or night.
ok(await goTo(78000, 'trench'), 'in the Twilight Trench');
ok(await waitFor(()=>window.game.scene.getScene('Game').regionDark > 0.5, 20000), 'the Trench is dark even by day');
ok(await G(()=>window.game.scene.getScene('Game').visionAt(78000) === 0.5), 'fish see half as far in the Trench');

// Kelp Forest: big bodies swim slower among the kelp, hatchlings dart freely.
ok(await goTo(91000, 'kelp'), 'in the Kelp Forest');
ok(await waitFor(()=>window.game.scene.getScene('Game').player.envSpeed === 1, 3000), 'a level 15 juvenile is not slowed by the kelp');
await G(()=>window.game.scene.getScene('Game').player.setLevel(35));
ok(await waitFor(()=>window.game.scene.getScene('Game').player.envSpeed < 1, 3000), 'an adult swims slower among the kelp');
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.kelpZones.filter(z=>g.regions.at(z.centerX).id==='kelp').length > g.kelpZones.filter(z=>g.regions.at(z.centerX).id==='coral').length * 14/24;}), 'the Kelp Forest has more kelp than anywhere');
await p.screenshot({path:'/tmp/kelp.png'});

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
console.log('errors', JSON.stringify(errs.slice(0,3)));
await b.close();
