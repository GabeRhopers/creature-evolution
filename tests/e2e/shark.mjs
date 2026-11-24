// The White Shark, the third hero: pick it, grow through its three stages,
// and check that Feeding Frenzy powers it up for a few seconds, then wears off.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const S=()=>G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player;return {species:pl.species.id, lv:pl.level, stage:pl.stage?.id, tex:pl.texture.key, ability:g.ability.label}});
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 5000, level);
  await waitFor(()=>window.game.scene.getScene('Game').evolveLock<=0, 20000); };
const shot=async(n,z=2)=>{await G((z)=>{window.game.scene.getScene('Game').cameras.main.setZoom(z)},z); await p.waitForTimeout(300); await p.screenshot({path:'/home/claude/stages/'+n+'.png'});};

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
const heroes = await G(()=>[...document.querySelectorAll('[data-hero]')].map(b=>b.dataset.hero));
ok(heroes.join()==='crocodile,mosa,white_shark,fang', 'home offers Croc, Mosa, Shark and Fang: '+heroes.join());
await p.click('[data-hero="white_shark"]'); await p.waitForTimeout(800);
ok(await G(()=>document.getElementById('heroCroc').getAttribute('aria-label')==='The White Shark'), 'the home logo shows the shark');
await p.screenshot({path:'/home/claude/stages/shark_home.png'});
await p.click('#btnPlay'); await p.waitForTimeout(1500);

let s=await S();
ok(s.species==='white_shark' && s.stage==='hatchling' && s.tex==='stage_white_shark_hatchling' && s.ability==='DART', 'a Shark run starts as a hatchling with DART: '+JSON.stringify(s));
await shot('shark_hatch',3);

await grow(11); s=await S();
ok(s.stage==='juvenile' && s.tex==='stage_white_shark_juvenile' && s.ability==='LUNGE', 'juvenile shark with LUNGE: '+JSON.stringify(s));
await shot('shark_juv',2);

await grow(21); s=await S();
ok(s.stage==='adult' && s.tex==='stage_white_shark_adult' && s.ability==='FRENZY', 'adult shark with FRENZY: '+JSON.stringify(s));
await shot('shark_adult',1.6);
const before = await G(()=>{const pl=window.game.scene.getScene('Game').player; return {bite:pl.mods.bite, speed:pl.mods.speed};});
await G(()=>{window.game.scene.getScene('Game').controller.uiDash=true;});
ok(await waitFor((b)=>{const pl=window.game.scene.getScene('Game').player; return pl.mods.bite>b.bite*1.4 && pl.mods.speed>b.speed*1.2;}, 3000, before), 'Feeding Frenzy: harder bites and faster swimming');
ok(await waitFor((b)=>{const pl=window.game.scene.getScene('Game').player; return Math.abs(pl.mods.bite-b.bite)<1e-6 && Math.abs(pl.mods.speed-b.speed)<1e-6;}, 30000, before), '...and it wears off');
ok(await G(()=>window.game.scene.getScene('Game').abilityCooldown>0), 'then it recharges');
console.log('errors', errs); await b.close();
