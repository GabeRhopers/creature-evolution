// New creatures and region mixes: archerfish in the swamp, polar cod in the ice, bull shark (16),
// leopard seal (19), anglerfish with a glowing lure (21), great white (25), sperm whale (30).
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 8000, level); };
const has=(id)=>G((id)=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id), id);
/** Where a species' fish are: count per region. */
const where=(id)=>G((id)=>{const g=window.game.scene.getScene('Game'); const n={coral:0,swamp:0,ice:0};
  for (const c of g.creatures) if (c.fish.species.id===id) n[g.regions.at(c.fish.x).id]++; return n;}, id);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload();
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 15000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__news=[]; const f=h.newCreature.bind(h); h.newCreature=(n,i)=>{window.__news.push(n); f(n,i);};});
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player;}, 10000);

// Region mixes at the start of a run.
const tang = await where('blue_tang'), archer = await where('archerfish'), cod = await where('polar_cod');
ok(tang.coral > (tang.swamp + tang.ice) * 3 && tang.ice === 0, 'blue tangs crowd the Coral Sea, none in the ice: '+JSON.stringify(tang));
ok(archer.swamp > 0 && archer.coral === 0 && archer.ice === 0, 'archerfish live in the Mangrove Swamp: '+JSON.stringify(archer));
ok(cod.ice > 0 && cod.coral === 0 && cod.swamp === 0, 'polar cod live in the Frozen Sea: '+JSON.stringify(cod));
ok(!(await has('bull_shark')) && !(await has('sperm_whale')), 'no new hunters at level 1');

// Hunters join at their levels, each with a NEW banner.
for (const [lv, id, name] of [[16,'bull_shark','Bull Shark'],[19,'leopard_seal','Leopard Seal'],[21,'anglerfish','Anglerfish'],[25,'great_white','Great White Shark'],[30,'sperm_whale','Sperm Whale']]) {
  await grow(lv);
  ok(await waitFor((id)=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id), 8000, id), `${name} joins at level ${lv}`);
  ok(await waitFor((n)=>window.__news.includes(n), 25000, name), `with a NEW banner for ${name}`);
}
const seal = await where('leopard_seal'), whale = await where('sperm_whale'), bull = await where('bull_shark');
ok(seal.ice > seal.coral + seal.swamp, 'leopard seals stay mostly in the Frozen Sea: '+JSON.stringify(seal));
ok(bull.swamp > bull.coral + bull.ice, 'bull sharks stay mostly in the swamp: '+JSON.stringify(bull));
ok(whale.swamp === 0, 'no whales in the shallow swamp: '+JSON.stringify(whale));

// Wandering keeps them home: a cod placed in the Coral Sea aims back for the ice.
const back = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='polar_cod');
  let ice=0; for (let i=0;i<40;i++){ const x=c.homeX(3000); if (g.regions.at(x).id==='ice') ice++; } return ice;});
ok(back === 40, 'a polar cod that drifts into the Coral Sea heads back to the ice ('+back+'/40)');

// The anglerfish's lure glows on screen.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; const c=g.creatures.find(c=>c.fish.species.id==='anglerfish');
  c.fish.arcadeBody.reset(pl.x+260, pl.y); c.brain.hunger=1;});
ok(await waitFor(()=>window.game.scene.getScene('Light').glows.some(d=>d.visible && d.tintTopLeft===0x2ce8f5), 5000), 'the anglerfish lure glows');
await p.waitForTimeout(400); await p.screenshot({path:'/home/claude/stages/creatures_angler.png'});
// A look at the whale and the great white next to the player.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player;
  const w=g.creatures.find(c=>c.fish.species.id==='sperm_whale'); w.fish.arcadeBody.reset(pl.x+700, pl.y+150);
  const s=g.creatures.find(c=>c.fish.species.id==='great_white'); s.fish.arcadeBody.reset(pl.x-500, pl.y-150); pl.invulnTimer=30;});
await p.waitForTimeout(600); await p.screenshot({path:'/home/claude/stages/creatures_whale.png'});
ok(await G(()=>window.game.scene.getScene('Game').creatures.find(c=>c.fish.species.id==='sperm_whale').fish.texture.key.startsWith('look_')), 'the whale wears its pixel look');

// Options > Enemy settings: a weight per region.
await G(()=>window.dispatchEvent(new CustomEvent('ce:pause')));
console.log('errors', errs);
ok(errs.length === 0, 'no page errors');
await b.close();
