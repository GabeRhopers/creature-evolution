import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
// The Checkpoint Crab's banner can replace an area banner on screen: record every area banner shown.
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__areaBanners=[]; const f=h.areaBanner.bind(h); h.areaBanner=(n)=>{window.__areaBanners.push(n.toUpperCase()); f(n);};});
await p.click('#btnPlay'); await p.waitForTimeout(1200);
// clear predators out of the way so nothing interferes
const calm = ()=>G(()=>{const g=window.game.scene.getScene('Game'); g.creatures.forEach(c=>{ if(c.brain) c.fish.setPosition(c.fish.x, 200); });});
const dive = async (depth, ms=1500, until=null)=>{ await G((d)=>{const g=window.game.scene.getScene('Game'); const top=120; g.player.setPosition(g.player.x, top+(g.seabedTop-top)*d); g.player.arcadeBody.setVelocity(0,0);}, depth); await p.waitForTimeout(ms);
  // Slow machines: wait (up to 3 s) for the game to notice the new depth.
  if (until) for (let i=0;i<30 && !(await G(()=>window.game.scene.getScene('Game').depthBlocked));i++) await p.waitForTimeout(100);
  return G(()=>{const g=window.game.scene.getScene('Game'); return {depth:+g.depthOf(g.player.y).toFixed(2), blocked:g.depthBlocked, status:window.game.scene.getScene('Hud').status.text, banner:window.game.scene.getScene('Hud').banner.text+' '+window.__areaBanners.join(' ')};}); };
await calm();
let r = await dive(0.6, 100, 'blocked'); console.log(JSON.stringify(r));
ok(r.blocked && r.status.includes('Too deep'), 'a hatchling below the shallows is told it is too deep');
ok(!r.banner.includes('REEF'), 'no banner for an area it cannot enter yet');
await p.screenshot({path:'/home/claude/stages/area_hatch.png'});
// The current pushes it back up; slow machines run the game clock slower, so poll up to 12 s.
for (let i=0;i<24;i++){ await p.waitForTimeout(500); r = await G(()=>{const g=window.game.scene.getScene('Game'); return {depth:+g.depthOf(g.player.y).toFixed(2)};}); if (r.depth<=0.45) break; }
ok(r.depth <= 0.45, 'the current pushes the hatchling back up: depth '+r.depth);
// juvenile: reef open, deep closed
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(10); g.grantXp(g.player.xpNeeded+1);}); await p.waitForTimeout(3500); await calm();
r = await dive(0.55, 900); ok(!r.blocked && r.banner.includes('REEF'), 'a juvenile can swim the reef, with a banner: '+r.banner.replace(/\n/g,' '));
r = await dive(0.85, 100, 'blocked'); ok(r.blocked, 'the deep is still closed to a juvenile');
// adult: everything open
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(20); g.grantXp(g.player.xpNeeded+1);}); await p.waitForTimeout(3500); await calm();
r = await dive(0.9, 900); ok(!r.blocked && r.banner.includes('DEEP'), 'an adult can reach the deep: '+r.banner);
console.log('errors', errs); await b.close();
