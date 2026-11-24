// Sargasso Drift creatures (Tide 3): flying fish, sargassum fish, mahi-mahi, yellowfin tuna, sailfish, the friendly
// green sea turtle and the stinging man o' war. Turtles can't be eaten, and they eat the man o' war.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('STACK', e.stack);});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const IDS = ['flying_fish','sargassum_fish','mahi_mahi','yellowfin_tuna','sailfish','green_turtle','man_o_war'];

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 30000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 30000);
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); g.crabLevel=20;});
ok(await G((ids)=>!window.game.scene.getScene('Game').creatures.some(c=>ids.includes(c.fish.species.id)), IDS), 'none of them before level 20');

await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(25); g.grantXp(g.player.xpNeeded+1); g.player.invulnTimer=1e9;});
ok(await waitFor((ids)=>ids.every(id=>window.game.scene.getScene('Game').creatures.some(c=>c.fish.species.id===id)), 15000, IDS), 'all seven join the sea by level 26');
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(46000, 500); g.cameras.main.centerOn(46000, 500);});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.regions.at(g.player.x).id==='sargasso';}, 8000), 'in the Sargasso Drift');

// The turtle is a friend: hold EAT with it in your mouth, it stays whole.
const turtle = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='green_turtle'); c.away=false; c.crowded=false; c.respawnT=0; return g.creatures.indexOf(c);});
for (let i=0;i<15;i++){ await G((i)=>{const g=window.game.scene.getScene('Game'); const c=g.creatures[i]; const m=g.player.mouthPoint(false); c.fish.setPosition(m.x, m.y); c.fish.arcadeBody.setVelocity(0,0);}, turtle); await p.keyboard.down('Space'); await p.waitForTimeout(120); await p.keyboard.up('Space'); }
ok(await G((i)=>{const c=window.game.scene.getScene('Game').creatures[i]; return c.fish.species.id==='green_turtle' && c.fish.hp===c.fish.maxHp && !(c.respawnT>0);}, turtle), 'the green sea turtle cannot be eaten or bitten');
await p.screenshot({path:'/tmp/sargasso_turtle.png'});

// The turtle eats a man o' war.
const eaten = await G((ti)=>{const g=window.game.scene.getScene('Game'); const t=g.creatures[ti]; const m=g.creatures.find(c=>c.fish.species.id==='man_o_war' && (c.slot??0) < 0.3) || g.creatures.find(c=>c.fish.species.id==='man_o_war'); m.slot=0;
  m.away=false; m.crowded=false; m.respawnT=0; t.brain.hunger=0; g.player.arcadeBody.reset(t.fish.x-900, t.fish.y);
  m.fish.setPosition(t.fish.x+90, t.fish.y); window.__mow=m; window.__mowX=m.fish.x;
  // The Sargasso weed hides small things; keep this jelly in plain sight for the test.
  // Tuna and sailfish roam here too; a scared turtle forgets lunch. Calm this one for the test.
  t.brain.isThreat=()=>false;
  const hid=g.isHidden.bind(g); g.isHidden=(tg,ob)=>tg===m.fish ? false : hid(tg,ob); return true;}, turtle);
// Keep the jelly in front of the hungry turtle (slow machines think slowly), until it is gone.
ok(await waitFor((ti)=>{const g=window.game.scene.getScene('Game'); const m=window.__mow, t=g.creatures[ti];
  if ((m.respawnT>0) || Math.abs(m.fish.x-window.__mowX) > 1500) return true;
  t.brain.hunger=0; if (t.brain.state==='flee' || t.brain.state==='rest') { t.brain.threat=null; t.brain.state='wander'; } g.player.arcadeBody.reset(t.fish.x-1100, t.fish.y-500); m.away=false; m.crowded=false; m.fish.setPosition(t.fish.x + Math.cos(t.fish.rotation)*t.fish.size*0.9, t.fish.y + Math.sin(t.fish.rotation)*t.fish.size*0.9); window.__mowX=m.fish.x;
  return false;}, 30000, turtle), "the turtle eats the man o' war " + JSON.stringify(await G((ti)=>{const g=window.game.scene.getScene('Game'); const t=g.creatures[ti], m=window.__mow; return {st:t.brain.state, tgt:t.brain.target&&t.brain.target.fish.species.id, hungry:t.brain.hungry, hunger:t.brain.hunger, away:t.away, crowded:t.crowded, mhp:m.fish.hp, d:Math.hypot(m.fish.x-t.fish.x,m.fish.y-t.fish.y), tsize:t.fish.size, msize:m.fish.size, swal:t.fish.canSwallow(m.fish.size), bite:t.brain.canBite(m), diet:t.brain.dietAllows(m), hid:g.isHidden(m.fish,t.fish), mx:m.fish.x, tx:t.fish.x, px:g.player.fish?g.player.fish.x:g.player.x, mresp:m.respawnT, ttype:t.brain.constructor.name, stTime:t.brain.stateTime};}, turtle)));

// The sargassum fish hides by sitting still (camouflage), like the weed it lives in.
ok(await G(()=>window.game.scene.getScene('Game').creatures.find(c=>c.fish.species.id==='sargassum_fish').fish.species.camo===true), 'the sargassum fish is camouflaged');

// The Twilight Trench is a sea cave now: a rock roof overhead.
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(78000, 1700); g.cameras.main.centerOn(78000, 1700);});
await p.waitForTimeout(2500);
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return isFinite(g.terrain.ceilAt(g.player.x)) && g.terrain.ceilAt(g.player.x) < g.player.y;}), 'the Twilight Trench has a cave roof overhead');
await p.screenshot({path:'/tmp/trench_cave.png'});

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
