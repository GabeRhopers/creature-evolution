// First boss: the Electric Eel in the Spring Cave (Mangrove Swamp). It appears at level 15 when you come near, warns
// before each shock, rises to the air hole to breathe (double damage window), is saved as beaten and never comes back.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>{errs.push(e.message); console.log('STACK', e.stack);});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const boss = () => G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; return c ? {hp:c.fish.hp, max:c.fish.maxHp, mode:c.brain.mode, x:c.fish.x, y:c.fish.y} : null;});
const place = (x, y) => G(([x,y])=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.arcadeBody.reset(x, y); g.cameras.main.centerOn(x, y);}, [x,y]);

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 30000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.bosses;}, 30000);
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); window.__ban=[]; const h=window.game.scene.getScene('Hud'); const f=h.bigBanner.bind(h); h.bigBanner=(t,l)=>{window.__ban.push(t); f(t,l);};});

// Before level 15 the cave is empty.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(12); g.player.invulnTimer=1e9;});
await place(35600, 1300); await p.waitForTimeout(2500);
ok(!(await boss()), 'no eel in the cave before level 15');
ok(await waitFor(()=>window.game.scene.getScene('Game').regionDark > 0.3, 15000), 'the cave is dim inside');
await p.screenshot({path:'/tmp/boss_cave.png'});

// Level 15: it wakes, a banner names it, the boss bar shows.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(15); g.player.invulnTimer=0; g.player.hp=g.player.maxHp;});
ok(await waitFor(async()=>!!window.game.scene.getScene('Game').bosses.current, 8000), 'at level 15 the Electric Eel appears');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('ELECTRIC EEL')), 8000), 'with a banner');
ok(await G(()=>window.game.scene.getScene('Hud').bossName?.visible), 'and a boss health bar');
const b0 = await boss();
ok(b0.max > 0 && b0.hp === b0.max, `it has full health (${Math.round(b0.max)})`);

// Shock: it crackles first (a warning), then a ring hurts you if you are close.
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; const a=g.bosses.active; a.shockIn=0; a.breathIn=99; g.player.invulnTimer=0;
  g.player.arcadeBody.reset(c.fish.x + 120, c.fish.y);});
ok(await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='charge', 6000), 'it charges up before a shock (the warning)');
const hp0 = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; g.player.arcadeBody.reset(c.fish.x + 120, c.fish.y); return g.player.hp;});
await p.screenshot({path:'/tmp/boss_charge.png'});
ok(await waitFor((h)=>window.game.scene.getScene('Game').player.hp < h, 6000, hp0), 'the shock hurts you if you stay close');

// Breath: it rises to the air hole and gulps; bites do double damage then.
await G(()=>{const g=window.game.scene.getScene('Game'); const a=g.bosses.active; a.breathIn=0; a.shockIn=99; g.player.invulnTimer=1e9; g.player.arcadeBody.reset(35000, 1300);});
ok(await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='gulp', 15000), 'it swims up to the air hole and gulps air');
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.bosses.damageMulAgainst(g.bosses.current) > 1;}), 'while it gulps, your bites do extra damage');
await p.screenshot({path:'/tmp/boss_gulp.png'});

// Leaving the cave pauses the fight; it heals.
await G(()=>{const g=window.game.scene.getScene('Game'); g.bosses.current.fish.hp = g.bosses.current.fish.maxHp * 0.5;});
await place(30000, 900);
ok(await waitFor(()=>!window.game.scene.getScene('Hud').bossName?.visible, 5000), 'swim away and the boss bar hides');
ok(await waitFor(()=>{const c=window.game.scene.getScene('Game').bosses.current; return c && c.fish.hp > c.fish.maxHp * 0.55;}, 10000), 'and it slowly heals while you are gone');

// Defeat it: banner, trophy, saved, and it does not come back.
await place(35600, 1300);
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; c.fish.hp = 1; g.kill(c, g.playerCreature);});
ok(await waitFor(()=>window.__ban.some(t=>t.includes('DEFEATED')), 5000), 'beating it shows a banner');
ok(await G(()=>window.game.scene.getScene('Game').bossesBeaten.includes('electric_eel')), 'it counts as beaten');
ok(await waitFor(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.bossesBeaten?.includes('electric_eel'), 5000), 'and is saved with the run');
await p.waitForTimeout(2000);
ok(!(await boss()), 'it does not come back');

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
