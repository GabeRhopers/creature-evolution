// First boss: the Electric Eel in the Coral Cave. A small entrance on the seabed in the Coral Sea always asks "Enter the
// cave?" (from level 15). Inside is a separate screen: a closed cave below the world. It warns before each shock, rises to the
// air pocket to breathe (double damage window). The EXIT tunnel asks "Leave the cave?"; it heals while you are gone; losing
// wakes you at the entrance; beaten = saved, with a free perk.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
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
await G(()=>{const g=window.game.scene.getScene('Game'); g.gates.openAll(); window.__ban=[]; const h=window.game.scene.getScene('Hud'); const f=h.bigBanner.bind(h); h.bigBanner=(t,l)=>{window.__ban.push(t+' | '+(l??'')); f(t,l);};});

const E = await G(()=>{const g=window.game.scene.getScene('Game'); const d=g.bosses.defs[0]; return {e:g.entranceSpot(d), L:g.arenaLayout(d), H:window.game.scene.getScene('Game').scale && 0};});
const WH = await G(()=>window.game.scene.getScene('Game').terrain ? 3200 : 3200);
const prompt = ()=>G(()=>!!document.getElementById('cYes')?.offsetParent);
const title = ()=>p.textContent('#panel h3');
/** Swim onto the cave entrance (from a little way off). */
const onEntrance = async ()=>{ await place(E.e.x - 900, E.e.y - 200); await p.waitForTimeout(500); await place(E.e.x, E.e.y); };
const inArena = ()=>G(()=>{const g=window.game.scene.getScene('Game'); return !!g.arena && g.player.y > 3200;});

// The entrance: small, on the seabed, in the background.
ok(await G((E)=>{const g=window.game.scene.getScene('Game'); const img=g.children.list.find(o=>o.texture?.key==='w_cave_entrance'); return !!img && img.depth < 0 && Math.abs(img.x-E.e.x)<5 && img.displayWidth < 400;}, E), 'a small cave entrance sits on the seabed, behind the fish');

// Before level 15: no question; it turns you back.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(12); g.player.invulnTimer=1e9;});
await onEntrance(); await p.waitForTimeout(1500);
ok(!(await prompt()) && !(await inArena()), 'before level 15 the cave does not let you in');

// Level 15: swimming onto the entrance asks; the game waits.
// Stay invulnerable for the rest of the test (a slow machine must not lose the fight mid-test); every boss hit is
// still recorded, and the Checkpoint Crab is out of the way (its level 10 already beaten).
await G(()=>{const g=window.game.scene.getScene('Game'); g.crabLevel=10; g.player.setLevel(15); g.player.invulnTimer=1e9; g.player.hp=g.player.maxHp;
  window.__hits=[]; const f=g.hurtPlayerBy.bind(g); g.hurtPlayerBy=(by,fr,st,label)=>{window.__hits.push(label); return f(by,fr,st,label);};});
await place(E.e.x - 1500, E.e.y - 300); await p.waitForTimeout(800);
await onEntrance();
ok(await waitFor(()=>!!document.getElementById('cYes')?.offsetParent, 8000), 'at level 15, swimming onto the entrance asks "Enter the cave?"');
ok((await title())==='Coral Cave' && await G(()=>window.game.scene.isPaused('Game')), 'the question names the Coral Cave and the game waits');
await p.screenshot({path:'/tmp/boss_prompt.png'});
await p.click('#cNo'); await p.waitForTimeout(800);
ok(!(await prompt()) && !(await inArena()) && !(await G(()=>window.game.scene.isPaused('Game'))), '"Not now": you stay in the sea and the game goes on');
await place(E.e.x + 30, E.e.y); await p.waitForTimeout(800);
ok(!(await prompt()), 'it does not keep asking while you stay on the entrance');
await place(E.e.x - 1500, E.e.y - 300); await p.waitForTimeout(800);
await onEntrance();
ok(await waitFor(()=>!!document.getElementById('cYes')?.offsetParent, 8000), 'swim away and back: it asks again');
await p.click('#cYes'); await p.waitForTimeout(800);
ok(await inArena(), 'Enter takes you to the boss arena, a separate place below the sea');
ok(await G((E)=>{const c=window.game.scene.getScene('Game').cameras.main; return Math.round(c._bounds.y)===E.L.outer.y && Math.round(c._bounds.width)===E.L.outer.w;}, E), 'the screen shows only the arena');
ok(await waitFor(async()=>!!window.game.scene.getScene('Game').bosses.current, 8000), 'the Electric Eel appears');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('ELECTRIC EEL')), 8000), 'with a banner');
ok(await G(()=>window.game.scene.getScene('Hud').bossName?.visible), 'and a boss health bar');
ok(await waitFor(()=>window.game.scene.getScene('Game').regionDark > 0.3, 15000), 'the cave is dim');
const b0 = await boss();
ok(b0.max > 0 && b0.hp === b0.max, `it has full health (${Math.round(b0.max)})`);
await G((E)=>{const g=window.game.scene.getScene('Game'); g.player.arcadeBody.reset(E.L.inner.x - 300, E.L.inner.y + 300);}, E);
await p.waitForTimeout(600);
ok(await G((E)=>{const pl=window.game.scene.getScene('Game').player; return pl.x >= E.L.inner.x - 5;}, E), 'the cave walls keep you in');
await p.waitForTimeout(1500);
await p.screenshot({path:'/tmp/boss_cave.png'});

// Shock: it crackles first (a warning), then a ring hurts you if you are close.
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; const a=g.bosses.active; a.shockIn=0; a.breathIn=99;
  const L=g.arenaLayout(g.arena); const R=L.inner.x+L.inner.w-60; const x=Math.min(R, Math.max(L.exit.x+L.exit.w+60, c.fish.x + (c.fish.x + 120 < R ? 120 : -120))); g.player.arcadeBody.reset(x, c.fish.y);});
ok(await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='charge', 6000), 'it charges up before a shock (the warning)');
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; const L=g.arenaLayout(g.arena); const R=L.inner.x+L.inner.w-60; const x=Math.min(R, Math.max(L.exit.x+L.exit.w+60, c.fish.x + (c.fish.x + 120 < R ? 120 : -120))); g.player.arcadeBody.reset(x, c.fish.y);});
await p.screenshot({path:'/tmp/boss_charge.png'});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; if (c && g.arena && !window.__hits.includes('ZAP!')) { const L=g.arenaLayout(g.arena); const R=L.inner.x+L.inner.w-60; g.player.arcadeBody.reset(Math.min(R, Math.max(L.exit.x+L.exit.w+60, c.fish.x + (c.fish.x + 100 < R ? 100 : -100))), c.fish.y); }
  return window.__hits.includes('ZAP!');}, 25000), 'the shock hits you if you stay close ' + JSON.stringify(await G(()=>{const a=window.game.scene.getScene('Game').bosses.active; return a ? {mode:a.mode, t:a.t, shockIn:a.shockIn, hits:window.__hits} : null;})));

// Breath: it rises to the air hole and gulps; bites do double damage then.
await G(()=>{const g=window.game.scene.getScene('Game'); const a=g.bosses.active; a.breathIn=0; a.shockIn=99; const L=g.arenaLayout(g.arena); g.player.arcadeBody.reset(L.start.x, L.inner.y + L.inner.h - 100);});
ok(await G(()=>window.game.scene.getScene('Game').arena !== null), 'still inside the arena for the breathing test');
const gulped = await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='gulp', 30000);
if (!gulped) console.log('boss now', JSON.stringify(await boss()));
ok(gulped, 'it swims up to the air hole and gulps air');
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.bosses.damageMulAgainst(g.bosses.current) > 1;}), 'while it gulps, your bites do extra damage');
await p.screenshot({path:'/tmp/boss_gulp.png'});

// The EXIT tunnel asks before you leave. Stay: you stay. Leave: back above the entrance; the fight pauses and it heals.
await G(()=>{const g=window.game.scene.getScene('Game'); g.bosses.current.fish.hp = g.bosses.current.fish.maxHp * 0.5;});
const toExit = ()=>G((E)=>{const g=window.game.scene.getScene('Game'); g.player.arcadeBody.reset(E.L.exit.x + 40, E.L.exit.y + E.L.exit.h/2);}, E);
await toExit();
ok(await waitFor(()=>!!document.getElementById('cYes')?.offsetParent, 8000) && (await title()).startsWith('Leave the Coral Cave'), 'swimming into the EXIT tunnel asks "Leave the cave?"');
await p.screenshot({path:'/tmp/boss_exit.png'});
await p.click('#cNo'); await p.waitForTimeout(600);
ok(await inArena() && await G((E)=>window.game.scene.getScene('Game').player.x > E.L.exit.x + E.L.exit.w, E), '"Stay" keeps you in the arena, just out of the tunnel');
await p.waitForTimeout(400);
await toExit();
ok(await waitFor(()=>!!document.getElementById('cYes')?.offsetParent, 8000), 'swim back into the tunnel and it asks again');
await p.click('#cYes'); await p.waitForTimeout(800);
ok(!(await inArena()) && await G((E)=>{const pl=window.game.scene.getScene('Game').player; return Math.abs(pl.x-E.e.x)<200 && pl.y < 3000;}, E), '"Leave" puts you back in the sea, above the cave entrance');
ok(await G(()=>{const c=window.game.scene.getScene('Game').cameras.main; return c._bounds.width > 50000;}), 'and the screen follows the whole sea again');
await p.waitForTimeout(1500);
ok(!(await prompt()), 'coming out does not ask to go straight back in');
ok(await waitFor(()=>!window.game.scene.getScene('Hud').bossName?.visible, 5000), 'the boss bar hides');
ok(await waitFor(()=>{const c=window.game.scene.getScene('Game').bosses.current; return c && c.fish.hp > c.fish.maxHp * 0.55;}, 10000), 'and it slowly heals while you are gone');

// Losing inside: no game over; you wake up at the entrance with some health, and the eel is back to full.
const enter = async ()=>{ await place(E.e.x - 1500, E.e.y - 300); await p.waitForTimeout(800); await onEntrance();
  await waitFor(()=>!!document.getElementById('cYes')?.offsetParent, 8000); await p.click('#cYes'); await p.waitForTimeout(600); };
await enter();
ok(await inArena(), 'back inside');
const cpX = await G(()=>{const g=window.game.scene.getScene('Game'); g.checkpoint(true); return JSON.parse(localStorage.getItem('ce.save.run.p1.crocodile.1')).data.x;});
ok(Math.abs(cpX - E.e.x) < 5, 'saving inside the arena saves you at the cave entrance (the arena is not part of the sea)');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.hp=1; g.playerDied(g.bosses.current, 'bitten');});
await p.waitForTimeout(500);
const lost = await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player, c=g.bosses.current; return {dead:g.dead, arena:!!g.arena, x:pl.x, y:pl.y, hp:pl.hp/pl.maxHp, boss:c?c.fish.hp/c.fish.maxHp:null};});
ok(!lost.dead && !lost.arena && Math.abs(lost.x - E.e.x) < 200 && lost.y < 3000, 'losing to the eel does not end the run: you wake up at the cave entrance '+JSON.stringify(lost));
ok(lost.hp > 0.2 && lost.hp < 0.5 && lost.boss===1, 'with some of your health, and the eel back to full');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('WINS THIS TIME')), 3000), 'a banner says it won this time');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.invulnTimer=1e9; g.player.hp=g.player.maxHp;});

// Defeat it: banner, trophy, saved, and it does not come back.
await enter();
const perksBefore = await G(()=>{const g=window.game.scene.getScene('Game'); window.__perkOffers=0; window.addEventListener('ce:perk',()=>window.__perkOffers++); return g.perks.length;});
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; c.fish.hp = 1; g.kill(c, g.playerCreature);});
ok(await waitFor(()=>window.__ban.some(t=>t.includes('DEFEATED')), 5000), 'beating it shows a banner');
ok(await G(()=>window.game.scene.getScene('Game').bossesBeaten.includes('electric_eel')), 'it counts as beaten');
ok(await waitFor(()=>JSON.parse(localStorage.getItem('ce.save.run.p1.crocodile.1')).data.bossesBeaten?.includes('electric_eel'), 5000), 'and is saved with the run');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('free perk')), 3000), 'the banner promises a free perk');
ok(await waitFor((n)=>window.__perkOffers>=1 && window.game.scene.getScene('Game').perks.length===n+1, 15000, perksBefore), 'a free perk choice opens and is taken (one extra perk)');
await p.waitForTimeout(2000);
ok(!(await boss()), 'it does not come back');

ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
