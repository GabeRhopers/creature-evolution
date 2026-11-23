// Gates between regions: closed until the Tide's Checkpoint Crab is beaten, then bitten (Root Tangle)
// or rammed (Rock Fall, Ice Walls) until they break; broken gates are saved with the run.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const gate = (id) => G((id)=>{const g=window.game.scene.getScene('Game').gates.gates.find(x=>x.def.id===id); return {open:g.open, hits:g.hits, images:g.images.length};}, id);
// Hold keys until fn() is true, pressing them again every 2 s (a perk choice makes the game forget held keys).
const holdUntil = async (keys, fn, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const k of keys) await p.keyboard.down(k);
    if (await waitFor(fn, 2000)) { for (const k of keys) await p.keyboard.up(k); return true; }
    for (const k of keys) await p.keyboard.up(k);
  }
  return G(fn);
};
// Put the player just before a gate (mid water) and point the camera there.
const placeAt = (x) => G((x)=>{const g=window.game.scene.getScene('Game'), pl=g.player; const y=g.terrain.surfaceY+260;
  pl.arcadeBody.reset(x, y); pl.heading=0; pl.invulnTimer=1e9; pl.hp=pl.maxHp; g.cameras.main.centerOn(x, y);}, x);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload();
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 20000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.gates;}, 15000);
await G(()=>{const h=window.game.scene.getScene('Hud'); window.__pop=[]; window.__ban=[]; const f=h.popup.bind(h); h.popup=(t,...a)=>{window.__pop.push(t); return f(t,...a);}; const bb=h.bigBanner.bind(h); h.bigBanner=(t,l)=>{window.__ban.push(t); bb(t,l);};});

ok(await G(()=>window.game.scene.getScene('Game').gates.gates.every(g=>!g.open && g.images.length>0)), 'a new run starts with every gate closed and drawn');
ok(await G(()=>['w_gate_root_tangle','w_gate_rock_fall','w_gate_ice_wall_east'].every(k=>window.game.scene.getScene('Game').textures.exists(k))), 'roots, rocks and ice walls have their art');

// 1. The Root Tangle before the level 10 crab: solid, a bite does nothing, a message says why.
await placeAt(23860);
await holdUntil(['ArrowRight', 'Space'], ()=>window.__pop.some(t=>t.includes('Beat the level 10')), 15000);
const blocked = await G(()=>{const g=window.game.scene.getScene('Game'); return {x:g.player.x};});
ok(blocked.x < 24000 - 80, `the Root Tangle stops you (x ${Math.round(blocked.x)})`);
ok((await gate('root_tangle')).hits === 0, 'biting it before the crab does nothing');
ok(await waitFor(()=>window.__pop.some(t=>t.includes('Beat the level 10 Checkpoint Crab')), 5000), 'a message says to beat the level 10 crab first');
await p.screenshot({path:'/home/claude/stages/gate_roots.png'});

// 2. After the level 10 crab: bite through it (EAT at the wall).
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(11); g.crabLevel=10;});
await placeAt(23860);
const bitten = await holdUntil(['ArrowRight', 'Space'], ()=>window.game.scene.getScene('Game').gates.isOpen('root_tangle'), 60000);
ok(bitten, 'after the crab, five bites break the Root Tangle');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('ROOT TANGLE BREAKS')), 5000), 'with a banner');
ok((await gate('root_tangle')).images === 0, 'and the wall is gone');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.gatesOpen?.includes('root_tangle')), 'the broken gate is saved right away');
await placeAt(23800);
const through = await holdUntil(['ArrowRight'], ()=>window.game.scene.getScene('Game').player.x > 24300, 30000);
ok(through, 'you can swim into the Mangrove Swamp');

// 3. The Rock Fall after the level 20 crab: ram it (sprint into it) until it breaks.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(21); g.crabLevel=20;});
await placeAt(37500);
await holdUntil(['Shift', 'ArrowRight'], ()=>(window.game.scene.getScene('Game').gates.gates.find(x=>x.def.id==='rock_fall').hits)>=1, 40000);
await p.screenshot({path:'/home/claude/stages/gate_rocks.png'});
const rammed = await holdUntil(['Shift', 'ArrowRight'], ()=>window.game.scene.getScene('Game').gates.isOpen('rock_fall'), 90000);
ok(rammed, 'after the level 20 crab, ramming breaks the Rock Fall');
ok((await gate('ice_wall_east')).open === false, 'the Ice Walls stay closed until the level 30 crab');
await placeAt(55600); await p.waitForTimeout(800);
await p.screenshot({path:'/home/claude/stages/gate_ice.png'});

// 4. Saved with the run: reload and continue.
await G(()=>window.game.scene.getScene('Game').checkpoint(true));
await p.reload();
await waitFor(()=>!document.getElementById('btnContinue').hidden, 20000);
await p.click('#btnContinue');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.gates;}, 15000);
const after = await G(()=>{const g=window.game.scene.getScene('Game'); return g.gates.openIds();});
ok(after.includes('root_tangle') && after.includes('rock_fall') && !after.includes('ice_wall_east'), 'a continued run keeps its broken gates: ' + after.join(', '));

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
