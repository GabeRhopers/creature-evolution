// The Elder Croc, the fifth hero (a pixel crocodile from a sheet of poses): pick it, grow through its three stages
// with their abilities, see its hurt pose and its standing roar, and play on an iPad-sized screen.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:820,height:1180}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('STACK', e.stack);});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const S=()=>G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player;return {species:pl.species.id, lv:pl.level, stage:pl.stage?.id, tex:pl.texture.key, frame:pl.frame.name, ability:g.ability.label}});
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const grow=async(level)=>{ await G((lv)=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(lv); g.grantXp(g.player.xpNeeded+1);}, level-1);
  await waitFor((lv)=>window.game.scene.getScene('Game').player.level===lv, 5000, level);
  await waitFor(()=>window.game.scene.getScene('Game').evolveLock<=0, 20000); };

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
const heroes = await G(()=>[...document.querySelectorAll('[data-hero]')].map(b=>b.dataset.hero));
ok(heroes.at(-1)==='elder_croc', 'home offers the Elder Croc: '+heroes.join());
ok(await G(()=>{const r=[...document.querySelectorAll('[data-hero]')].map(b=>b.getBoundingClientRect()); return r.every(x=>x.right<=window.innerWidth && x.left>=0);}), 'all five hero buttons fit on an iPad screen');
await p.click('[data-hero="elder_croc"]'); await p.waitForTimeout(800);
ok(await G(()=>document.getElementById('heroCroc').getAttribute('aria-label')==='The Elder Croc'), 'the home logo shows the Elder Croc');
await p.screenshot({path:'/tmp/elder_home.png'});
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.player && !g.menuMode;}, 30000); await p.waitForTimeout(800);

let s=await S();
ok(s.species==='elder_croc' && s.stage==='hatchling' && s.tex==='stage_elder_croc_hatchling' && s.ability==='LUNGE', 'an Elder Croc run starts as a hatchling with LUNGE: '+JSON.stringify(s));
await G(()=>{const pl=window.game.scene.getScene('Game').player; pl.sinceHurt=0;});
ok(await waitFor(()=>{const pl=window.game.scene.getScene('Game').player; return pl.frame.name===pl.skinFrames?.damage;}, 3000), 'it shows its hurt pose when hit');
await G(()=>{const pl=window.game.scene.getScene('Game').player; pl.sinceHurt=9; pl.playCelebrate();});
ok(await waitFor(()=>{const pl=window.game.scene.getScene('Game').player; return (pl.skinFrames?.celebrate ?? []).includes(pl.frame.name);}, 3000), 'and stands up to roar (the cheer)');

await grow(11); s=await S();
ok(s.stage==='juvenile' && s.tex==='stage_elder_croc_juvenile' && s.ability==='ROLL', 'juvenile Elder Croc with ROLL: '+JSON.stringify(s));
await grow(21); s=await S();
ok(s.stage==='adult' && s.tex==='stage_elder_croc_adult' && s.ability==='CRUSH', 'adult Elder Croc with CRUSH: '+JSON.stringify(s));
await G(()=>{const g=window.game.scene.getScene('Game'); g.cameras.main.setZoom(1.6);}); await p.waitForTimeout(400);
await p.screenshot({path:'/tmp/elder_adult.png'});
ok(await G(()=>window.game.scene.getScene('Game').player.species.armor >= 0.3), 'it has the toughest hide');
ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
