// Kelp Forest creatures (Tide 6): garibaldi, California sheephead, purple sea urchin, the friendly sea otter and the
// California sea lion. Otters can't be eaten and they eat urchins; urchins sting when you bite them.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const IDS = ['garibaldi','sheephead','sea_urchin','sea_otter','sea_lion'];
/** Wake one fish of a species and put it at (x, y) (or in front of the player's mouth). */
const pick = (id)=>G((id)=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id===id && c.fish.active && !c.away) ?? g.creatures.find(c=>c.fish.species.id===id); c.away=false; c.crowded=false; c.respawnT=0; return g.creatures.indexOf(c);}, id);

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 30000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 30000);
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); g.crabLevel=50;});
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(45); g.grantXp(g.player.xpNeeded+1); g.player.invulnTimer=1e9;});
await waitFor(()=>window.game.scene.getScene('Game').player.level===46, 8000);
ok(await G((ids)=>!window.game.scene.getScene('Game').creatures.some(c=>ids.includes(c.fish.species.id)), IDS), 'none of them before level 50');

await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(55); g.grantXp(g.player.xpNeeded+1); g.player.invulnTimer=1e9;});
ok(await waitFor((ids)=>ids.every(id=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id)), 15000, IDS), 'all five join the sea by level 56');
ok(await G((ids)=>{const g=window.game.scene.getScene('Game'); return ids.every(id=>g.creatures.filter(c=>c.fish.species.id===id).every(c=>g.regions.at(c.homeX()).id==='kelp'));}, IDS), 'they all live in the Kelp Forest');
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(91000, 700); g.cameras.main.centerOn(91000, 700);});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.regions.at(g.player.x).id==='kelp';}, 8000), 'in the Kelp Forest');

// Show them all near the player for a screenshot.
await G((ids)=>{const g=window.game.scene.getScene('Game'), pl=g.player; ids.forEach((id,k)=>{const c=g.creatures.find(c=>c.fish.species.id===id); c.away=false; c.crowded=false; c.fish.setPosition(pl.x-500+k*250, pl.y+(k%2?120:-120)); c.fish.arcadeBody?.setVelocity(0,0);});}, IDS);
await p.waitForTimeout(800);
await p.screenshot({path:'/tmp/kelp_life.png'});

// The otter is a friend: hold EAT with it in your mouth, it stays whole.
const otter = await pick('sea_otter');
for (let i=0;i<15;i++){ await G((i)=>{const g=window.game.scene.getScene('Game'); const c=g.creatures[i]; const m=g.player.mouthPoint(false); c.fish.setPosition(m.x, m.y); c.fish.arcadeBody?.setVelocity(0,0);}, otter); await p.keyboard.down('Space'); await p.waitForTimeout(120); await p.keyboard.up('Space'); }
ok(await G((i)=>{const c=window.game.scene.getScene('Game').creatures[i]; return c.fish.species.id==='sea_otter' && c.fish.hp===c.fish.maxHp && !(c.respawnT>0);}, otter), 'the sea otter cannot be eaten or bitten');

// Urchins: on the menu of the otter and the sheephead, and nobody else hunts the otter.
ok(await G((oi)=>{const g=window.game.scene.getScene('Game'); const o=g.creatures[oi]; const u=g.creatures.find(c=>c.fish.species.id==='sea_urchin'); const s=g.creatures.find(c=>c.fish.species.id==='sheephead'); const l=g.creatures.find(c=>c.fish.species.id==='sea_lion');
  return o.brain.dietAllows(u) && s.brain.dietAllows(u) && !l.brain.dietAllows(o);}, otter), 'otters and sheephead eat urchins; sea lions leave the otter alone');

// Biting an urchin stings.
const urchin = await pick('sea_urchin');
const hp0 = await G(()=>{const g=window.game.scene.getScene('Game'); g.player.invulnTimer=0; g.player.hp=g.player.maxHp; return g.player.hp;});
for (let i=0;i<10;i++){ await G((i)=>{const g=window.game.scene.getScene('Game'); const c=g.creatures[i]; if (!c.fish.active) return; const m=g.player.mouthPoint(false); c.fish.setPosition(m.x, m.y); c.fish.arcadeBody?.setVelocity(0,0);}, urchin); await p.keyboard.down('Space'); await p.waitForTimeout(150); await p.keyboard.up('Space'); }
ok(await G((hp0)=>window.game.scene.getScene('Game').player.hp < hp0, hp0), 'biting a sea urchin stings');

// The otter eats an urchin (kept in front of the hungry, calm otter; slow machines think slowly).
await G((oi)=>{const g=window.game.scene.getScene('Game'); const o=g.creatures[oi]; const u=g.creatures.filter(c=>c.fish.species.id==='sea_urchin' && c.fish.active && !(c.respawnT>0)).sort((a,b)=>a.fish.size-b.fish.size)[0]; u.away=false; u.crowded=false;
  // A small urchin, so the otter can swallow it whatever levels were rolled.
  u.fish.setLevel(1); window.__u=u; window.__uX=u.fish.x; o.brain.isThreat=()=>false;
  const hid=g.isHidden.bind(g); g.isHidden=(tg,ob)=>tg===u.fish ? false : hid(tg,ob);}, otter);
ok(await waitFor((oi)=>{const g=window.game.scene.getScene('Game'); const u=window.__u, o=g.creatures[oi];
  if ((u.respawnT>0) || !u.fish.active || Math.abs(u.fish.x-window.__uX) > 1500) return true;
  o.away=false; o.crowded=false; o.brain.hunger=0; if (o.brain.state==='flee' || o.brain.state==='rest') { o.brain.threat=null; o.brain.state='wander'; }
  g.player.arcadeBody.reset(o.fish.x-1100, o.fish.y-400); u.away=false; u.crowded=false;
  u.fish.setPosition(o.fish.x + Math.cos(o.fish.rotation)*o.fish.size*0.9, o.fish.y + Math.sin(o.fish.rotation)*o.fish.size*0.9); window.__uX=u.fish.x;
  return false;}, 45000, otter), 'the sea otter eats a sea urchin ' + JSON.stringify(await G((oi)=>{const g=window.game.scene.getScene('Game'); const o=g.creatures[oi], u=window.__u; return {st:o.brain.state, swal:o.fish.canSwallow(u.fish.size), os:o.fish.size, us:u.fish.size, hungry:o.brain.hungry};}, otter)));

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
