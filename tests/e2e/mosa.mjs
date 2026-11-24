// Mosa, the second hero: pick it on the home screen, grow through its three stages,
// use each of its abilities, and continue a saved Mosa run.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const S=()=>G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player;return {species:pl.species.id, lv:pl.level, stage:pl.stage?.id, tex:pl.texture.key, ability:g.ability.label, dead:g.dead}});
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const shot=async(n,z=2)=>{await G((z)=>{window.game.scene.getScene('Game').cameras.main.setZoom(z)},z); await p.waitForTimeout(300); await p.screenshot({path:'/home/claude/stages/'+n+'.png'});};
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 5000, level);
  await waitFor(()=>window.game.scene.getScene('Game').evolveLock<=0, 20000); };
/** Park one reef fish next to the player's mouth (or around it) and hold it there. */
const park = (id, around=false)=>G(([id,around])=>{const g=window.game.scene.getScene('Game'),pl=g.player; const c=g.creatures.find(c=>c.brain&&c.fish.active&&c.fish.species.id===id); const m=around?{x:pl.x,y:pl.y+pl.size*1.6}:pl.mouthPoint(); c.fish.setPosition(m.x+(around?0:c.fish.size*0.3),m.y); c.fish.arcadeBody?.setVelocity(0,0); return g.creatures.indexOf(c);}, [id,around]);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
const heroes = await G(()=>[...document.querySelectorAll('[data-hero]')].map(b=>b.dataset.hero+':'+b.getAttribute('aria-pressed')));
ok(heroes.join().startsWith('crocodile:true,mosa:false'), 'home offers Croc (picked) and Mosa: '+heroes.join());
await p.click('[data-hero="mosa"]');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.hero==='mosa'), 'the pick is remembered');
await p.screenshot({path:'/home/claude/stages/mosa_home.png'});
await p.click('#btnPlay'); await p.waitForTimeout(1500);

let s=await S(); console.log(JSON.stringify(s));
ok(s.species==='mosa' && s.stage==='hatchling' && s.tex==='stage_mosa_hatchling', 'a Mosa run starts as a Mosa hatchling');
ok(s.ability==='DART', 'hatchling ability is DART');
await shot('mosa_hatch',3);
const st0 = await G(()=>window.game.scene.getScene('Game').player.stamina);
await G(()=>{window.game.scene.getScene('Game').controller.uiDash=true;});
ok(await waitFor((st0)=>window.game.scene.getScene('Game').player.stamina<st0, 3000, st0), 'DART dashes (uses stamina)');

await grow(11); s=await S();
ok(s.stage==='juvenile' && s.tex==='stage_mosa_juvenile' && s.ability==='SLAM', 'juvenile Mosa with SLAM: '+JSON.stringify(s));
await shot('mosa_juv',2);
const ref = await park('blue_tang', true);
const kills0 = await G(()=>window.game.scene.getScene('Game').stats.kills);
const hp0 = await G((i)=>window.game.scene.getScene('Game').creatures[i].fish.hp, ref);
await G(()=>{window.game.scene.getScene('Game').controller.uiDash=true;});
ok(await waitFor(([i,hp0,k0])=>{const g=window.game.scene.getScene('Game'),f=g.creatures[i].fish; return g.abilityCooldown>0 && (f.hp<hp0||f.stunned||g.stats.kills>k0);}, 3000, [ref,hp0,kills0]), 'Tail Slam hits a fish around the Mosa');

await grow(21); s=await S();
ok(s.stage==='adult' && s.tex==='stage_mosa_adult' && s.ability==='CRUSH', 'adult Mosa with CRUSH: '+JSON.stringify(s));
await shot('mosa_adult',1.6);
const r2 = await park('red_grouper');
const before = await G((i)=>{const g=window.game.scene.getScene('Game'); return {hp:g.creatures[i].fish.hp, kills:g.stats.kills, rot:g.player.rotation};}, r2);
let hit=false, spun=false;
for (let i=0;i<30 && !hit;i++){ await p.waitForTimeout(200);
  const a = await G(([i])=>{const g=window.game.scene.getScene('Game'),t=g.creatures[i]; if(t.fish.active){const m=g.player.mouthPoint(); t.fish.setPosition(m.x+t.fish.size*0.3,m.y); t.fish.arcadeBody?.setVelocity(0,0);} if(g.abilityCooldown<=0) g.controller.uiDash=true; return {hp:t.fish.hp,kills:g.stats.kills,roll:g.rollTimer};}, [r2]);
  hit = a.hp<before.hp || a.kills>before.kills; spun = spun || a.roll>0; }
ok(hit, 'Crushing Bite hits the red grouper');
ok(!spun, 'Crushing Bite does not spin like the Death Roll');

// save and continue keeps the hero
await G(()=>window.game.scene.getScene('Game').checkpoint(true));
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.species==='mosa'), 'the checkpoint is a Mosa run');
await p.click('[data-hero="crocodile"]').catch(()=>{});            // hidden during play: no effect
await p.reload(); await p.waitForTimeout(3500);
ok((await p.textContent('#continueSub')).includes(': Mosa'), 'Continue shows the Mosa run: '+await p.textContent('#continueSub'));
await p.click('[data-hero="crocodile"]');                           // pick the croc for NEW runs...
await p.click('#btnContinue');
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.level>=21;}, 5000), 'the saved run is back');
s=await S(); ok(s.species==='mosa' && s.tex==='stage_mosa_adult', '...and it is still a Mosa: '+JSON.stringify(s));

// a new run with the croc picked is a croc
await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(800);
await G(()=>{document.querySelector('#btnPlay').click();}); await p.waitForTimeout(600);
await G(()=>document.querySelector('#pNew')?.click());
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && g.player.species.id==='crocodile';}, 5000), 'a new run with Croc picked is a crocodile');
s=await S(); ok(s.tex==='stage_hatchling' && s.ability==='SHELL', 'croc hatchling unchanged: '+JSON.stringify(s));
console.log('errors', errs); await b.close();
