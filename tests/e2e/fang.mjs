// Fang, the fourth hero (a pixel great white from a sheet of poses): pick it, grow through its three
// stages, see its hurt pose, leap onto an island, then switch heroes and leap again (the iPad freeze
// report). Also checks the game loop keeps running after an error inside a frame.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1180,height:820}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const S=()=>G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player;return {species:pl.species.id, lv:pl.level, stage:pl.stage?.id, tex:pl.texture.key, frame:pl.frame.name, ability:g.ability.label, land:g.landState, errors:g.frameErrors}});
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 5000, level);
  await waitFor(()=>window.game.scene.getScene('Game').evolveLock<=0, 20000); };
const shot=async(n,z=2)=>{await G((z)=>{window.game.scene.getScene('Game').cameras.main.setZoom(z)},z); await p.waitForTimeout(300); await p.screenshot({path:'/home/claude/stages/'+n+'.png'});};
const play=async(hero)=>{ await p.click(`[data-hero="${hero}"]`); await p.waitForTimeout(500); await p.click('#btnPlay'); await p.waitForTimeout(400);
  await G(()=>document.getElementById('pNew')?.click());
  await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.player && !g.menuMode;}, 30000); await p.waitForTimeout(800); };
const home=async()=>{ await G(()=>window.game.scene.getScene('Game').goHome()); await waitFor(()=>!!document.querySelector('[data-hero]')?.offsetParent, 15000); await p.waitForTimeout(800); };
/** Leap from beside an island and wait to land; then crawl a little. */
const leap=async(style)=>{
  const isl = await G((style)=>{const g=window.game.scene.getScene('Game'); const i=g.terrain.cfg.islands.find((x)=>(x.style??'sand')===style); return {x:i.x, w:i.width, surface:g.terrain.surfaceY};}, style);
  await G((isl)=>{const g=window.game.scene.getScene('Game'); g.player.invulnTimer=1e9; const pl=g.player; pl.setPosition(isl.x-isl.w/2-80, isl.surface+24); pl.body.setVelocity(340,-560); pl.isSprinting=true; g.checkLeap();}, isl);
  const landed = await waitFor(()=>window.game.scene.getScene('Game').landState==='land', 20000);
  const f0 = await G(()=>window.game.loop.frame);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(1500); await p.keyboard.up('ArrowRight');
  await G(()=>{window.game.scene.getScene('Game').dryTime=0;});
  const moving = await waitFor((f0)=>window.game.loop.frame > f0+5, 10000, f0);
  return landed && moving;
};

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
const heroes = await G(()=>[...document.querySelectorAll('[data-hero]')].map(b=>b.dataset.hero));
ok(heroes.includes('fang'), 'home offers Fang: '+heroes.join());
await p.click('[data-hero="fang"]'); await p.waitForTimeout(800);
ok(await G(()=>document.getElementById('heroCroc').getAttribute('aria-label')==='The Fang'), 'the home logo shows Fang');
await p.screenshot({path:'/home/claude/stages/fang_home.png'});
await play('fang');

let s=await S();
ok(s.species==='fang' && s.stage==='hatchling' && s.tex==='stage_fang_hatchling' && s.ability==='LUNGE', 'a Fang run starts as a hatchling with LUNGE: '+JSON.stringify(s));
await shot('fang_hatch',3);
// The hurt pose from the sheet shows when Fang is hit.
await G(()=>{const pl=window.game.scene.getScene('Game').player; pl.sinceHurt=0;});
ok(await waitFor(()=>{const pl=window.game.scene.getScene('Game').player; return pl.frame.name===pl.skinFrames?.damage;}, 3000), 'Fang shows its hurt pose when hit');

await grow(11); s=await S();
ok(s.stage==='juvenile' && s.tex==='stage_fang_juvenile' && s.ability==='CRUSH', 'juvenile Fang with CRUSH: '+JSON.stringify(s));
await grow(21); s=await S();
ok(s.stage==='adult' && s.tex==='stage_fang_adult' && s.ability==='FRENZY', 'adult Fang with FRENZY: '+JSON.stringify(s));
await shot('fang_adult',1.6);

ok(await leap('sand'), 'Fang leaps onto a sand island and the game keeps running');
await shot('fang_land',1.6);

// Switch heroes from the home screen and go onto land again with each one.
for (const hero of ['crocodile','white_shark','mosa','fang']) {
  await home(); await play(hero);
  const sp = (await S()).species;
  ok(sp===hero && await leap(hero==='mosa'?'mangrove':'sand'), `after switching to ${hero}, leaping onto land keeps the game running`);
}
ok((await S()).errors===0, 'no frame errors: '+(await S()).errors);

// An error inside a frame (here: the HUD) must not stop the game loop.
const f0 = await G(()=>{window.game.events.once('prestep', ()=>{ throw new Error('test: one bad frame'); }); return window.game.loop.frame;});
ok(await waitFor((f0)=>window.game.loop.frame > f0+20, 20000, f0), 'the game keeps running after an error in a frame');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.errors')||'[]').some(e=>e.msg.includes('one bad frame'))), 'the problem is noted in the problem log');
ok(await waitFor(()=>document.getElementById('eResume')?.offsetParent!=null, 5000), 'the "Something went wrong" panel offers Keep playing');
ok(await G(()=>document.querySelector('.err-line')?.textContent.includes('one bad frame')), 'and shows what went wrong');
await p.click('#eResume'); await p.waitForTimeout(500);
const f1 = await G(()=>window.game.loop.frame);
ok(await waitFor((f1)=>window.game.loop.frame > f1+10 && !window.game.scene.isPaused('Game'), 20000, f1), 'Keep playing really keeps playing');
console.log('errors', errs); await b.close();
