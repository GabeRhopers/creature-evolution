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
const where=(id)=>G((id)=>{const g=window.game.scene.getScene('Game'); const n={coral:0,swamp:0,sargasso:0,volcano:0,trench:0,kelp:0,ice:0};
  for (const c of g.creatures) if (c.fish.species.id===id) n[g.regions.at(c.fish.x).id]++; return n;}, id);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload();
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 15000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__news=[]; const f=h.newCreature.bind(h); h.newCreature=(n,i)=>{window.__news.push(n); f(n,i);};});
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player;}, 10000);

// Region mixes at the start of a run.
const tang = await where('blue_tang'), archer = await where('archerfish'), cod = await where('polar_cod');
ok(tang.coral > tang.swamp + tang.volcano + tang.ice && tang.ice === 0, 'blue tangs crowd the Coral Sea, none in the ice: '+JSON.stringify(tang));
ok(archer.swamp > 0 && archer.coral + archer.volcano + archer.ice === 0, 'archerfish live in the Mangrove Swamp: '+JSON.stringify(archer));
ok(cod.ice > 0 && cod.coral + cod.swamp + cod.volcano === 0, 'polar cod live in the Frozen Sea: '+JSON.stringify(cod));
ok(!(await has('bull_shark')) && !(await has('sperm_whale')), 'no new hunters at level 1');

// Hunters join at their levels, each with a NEW banner.
for (const [lv, id, name] of [[8,'box_jelly','Box Jellyfish'],[12,'sea_snake','Sea Snake'],[16,'bull_shark','Bull Shark'],[21,'giant_octopus','Giant Octopus'],[21,'anglerfish','Anglerfish'],[24,'giant_squid','Giant Squid'],[25,'great_white','Great White Shark'],[30,'sperm_whale','Sperm Whale'],[31,'leopard_seal','Leopard Seal'],[33,'orca','Orca']]) {
  await grow(lv);
  ok(await waitFor((id)=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id), 8000, id), `${name} joins at level ${lv}`);
  ok(await waitFor((n)=>window.__news.includes(n), 25000, name), `with a NEW banner for ${name}`);
}
const seal = await where('leopard_seal'), whale = await where('sperm_whale'), bull = await where('bull_shark');
// Hunters roam while they chase: check where they head home to, not one snapshot.
const homes=(id)=>G((id)=>{const g=window.game.scene.getScene('Game'); const n={coral:0,swamp:0,sargasso:0,volcano:0,trench:0,kelp:0,ice:0};
  for (const c of g.creatures) if (c.fish.species.id===id) for (let i=0;i<20;i++) n[g.regions.at(c.homeX()).id]++; return n;}, id);
const sealHome = await homes('leopard_seal'), bullHome = await homes('bull_shark');
ok(sealHome.ice > 0 && sealHome.coral + sealHome.swamp + sealHome.volcano === 0, 'leopard seals live only in the Frozen Sea: '+JSON.stringify(sealHome)+' now '+JSON.stringify(seal));
ok(bullHome.swamp > (bullHome.coral + bullHome.ice + bullHome.volcano) * 2 && bullHome.ice + bullHome.volcano === 0, 'bull sharks live mostly in the swamp: '+JSON.stringify(bullHome)+' now '+JSON.stringify(bull));
ok(whale.swamp === 0, 'no whales in the shallow swamp: '+JSON.stringify(whale));

const octo = await where('giant_octopus'), orca = await where('orca');
const octoHome = await homes('giant_octopus');
ok(octoHome.volcano > octoHome.coral + octoHome.swamp + octoHome.ice && octoHome.swamp === 0, 'octopuses live mostly in the Volcanic Rift: '+JSON.stringify(octoHome)+' now '+JSON.stringify(octo));
// Fast pod hunters roam while they chase: check where they head home to, not one snapshot.
const orcaHome = await G(()=>{const g=window.game.scene.getScene('Game'); const n={coral:0,swamp:0,sargasso:0,volcano:0,trench:0,kelp:0,ice:0};
  for (const c of g.creatures) if (c.fish.species.id==='orca') for (let i=0;i<20;i++) n[g.regions.at(c.homeX()).id]++; return n;});
ok(orcaHome.ice > (orcaHome.coral + orcaHome.swamp + orcaHome.volcano) * 3 && orcaHome.swamp + orcaHome.volcano === 0, 'orca pods live in the Frozen Sea (where they head home): '+JSON.stringify(orcaHome)+' now '+JSON.stringify(orca));
// (Fish far off screen are not drawn or updated, so look at one in view.)
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; const c=g.creatures.find(c=>c.fish.species.id==='box_jelly'&&!c.away); c.fish.arcadeBody.reset(pl.x+200, pl.y); window.__jelly=c;});
ok(await waitFor(()=>window.__jelly.fish.visible && window.__jelly.fish.alpha < 1, 5000), 'the box jellyfish is see-through');
// An octopus sitting still fades and hides from fish farther away.
const camo = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='giant_octopus'&&!c.away); const f=c.fish;
  const pl=g.player; f.arcadeBody.reset(pl.x+300, pl.y); f.setVisible(true); f.hp=f.maxHp; f.pose(0.016); const fish=g.creatures.find(o=>o.fish.species.id==='red_grouper').fish;
  fish.setPosition(f.x + f.size*8, f.y); const far=g.isHidden(f, fish); fish.setPosition(f.x + f.size*2, f.y); const near=g.isHidden(f, fish);
  return {alpha:f.alpha, camo:f.camouflaged, far, near};});
ok(camo.camo && camo.alpha < 0.5 && camo.far && !camo.near, 'a still octopus fades and hides from fish farther away: '+JSON.stringify(camo));
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player;
  const o=g.creatures.find(c=>c.fish.species.id==='orca'&&!c.away); o.fish.arcadeBody.reset(pl.x+600, pl.y-100);
  const s=g.creatures.find(c=>c.fish.species.id==='giant_squid'&&!c.away); s.fish.arcadeBody.reset(pl.x-500, pl.y+150);
  const j=g.creatures.find(c=>c.fish.species.id==='box_jelly'&&!c.away); j.fish.arcadeBody.reset(pl.x+150, pl.y+250);
  const n=g.creatures.find(c=>c.fish.species.id==='sea_snake'&&!c.away); n.fish.arcadeBody.reset(pl.x-250, pl.y-200);
  const q=g.creatures.find(c=>c.fish.species.id==='giant_octopus'&&!c.away); q.fish.arcadeBody.reset(pl.x+350, pl.y+120); pl.invulnTimer=30;});
await p.waitForTimeout(500); await p.screenshot({path:'/home/claude/stages/creatures_beasts.png'});

// Wandering keeps them home: a cod placed in the Coral Sea aims back for the ice.
const back = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='polar_cod'&&!c.away);
  let ice=0; for (let i=0;i<40;i++){ const x=c.homeX(3000); if (g.regions.at(x).id==='ice') ice++; } return ice;});
ok(back === 40, 'a polar cod that drifts into the Coral Sea heads back to the ice ('+back+'/40)');

// The anglerfish's lure glows on screen.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; const c=g.creatures.find(c=>c.fish.species.id==='anglerfish'&&!c.away);
  c.fish.arcadeBody.reset(pl.x+260, pl.y); c.brain.hunger=1;});
ok(await waitFor(()=>window.game.scene.getScene('Light').glows.some(d=>d.visible && d.tintTopLeft===0x2ce8f5), 5000), 'the anglerfish lure glows');
await p.waitForTimeout(400); await p.screenshot({path:'/home/claude/stages/creatures_angler.png'});
// A look at the whale and the great white next to the player.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player;
  const w=g.creatures.find(c=>c.fish.species.id==='sperm_whale'&&!c.away); w.fish.arcadeBody.reset(pl.x+700, pl.y+150);
  const s=g.creatures.find(c=>c.fish.species.id==='great_white'&&!c.away); s.fish.arcadeBody.reset(pl.x-500, pl.y-150); pl.invulnTimer=30;});
await p.waitForTimeout(600); await p.screenshot({path:'/home/claude/stages/creatures_whale.png'});
ok(await G(()=>window.game.scene.getScene('Game').creatures.find(c=>c.fish.species.id==='sperm_whale'&&!c.away).fish.texture.key.startsWith('look_')), 'the whale wears its pixel look');

// Options > Enemy settings: a weight per region.
await G(()=>window.dispatchEvent(new CustomEvent('ce:pause')));
console.log('errors', errs);
ok(errs.length === 0, 'no page errors');
await b.close();
