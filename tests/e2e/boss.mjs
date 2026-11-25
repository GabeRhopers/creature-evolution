// First boss: the Electric Eel in the Coral Cave, its own arena in the Coral Sea. Swimming into a cave mouth asks first
// (from level 15); inside, the camera stays in the cave and other fish are kept out. It warns before each shock, rises to
// the air hole to breathe (double damage window); swim out to leave (it heals); losing wakes you outside; beaten = saved.
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

const E = await G(()=>{const d=window.game.scene.getScene('Game').bosses.defs[0]; return {left:d.left, right:d.right, airX:d.airX};});
const midY = (x)=>G((x)=>{const g=window.game.scene.getScene('Game'); return g.chamberMidY(null, x);}, x);
const prompt = ()=>G(()=>!!document.getElementById('cEnter')?.offsetParent);
/** Swim into the left mouth (from just outside it). */
const intoMouth = async ()=>{ const y = await midY(E.left + 60); await place(E.left - 900, y); await p.waitForTimeout(400); await place(E.left + 60, y); };

// Before level 15: no prompt; you are turned back at the mouth.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(12); g.player.invulnTimer=1e9;});
await intoMouth();
await p.waitForTimeout(1500);
ok(!(await prompt()) && await G((l)=>window.game.scene.getScene('Game').player.x < l, E.left), 'before level 15 the cave turns you back (no prompt)');
ok(!(await boss()), 'and there is no eel yet');

// Level 15: swim into a mouth and a prompt asks first; the game waits.
// Stay invulnerable for the rest of the test (a slow machine must not lose the fight mid-test); every boss hit is
// still recorded, and the Checkpoint Crab is out of the way (its level 10 already beaten).
await G(()=>{const g=window.game.scene.getScene('Game'); g.crabLevel=10; g.player.setLevel(15); g.player.invulnTimer=1e9; g.player.hp=g.player.maxHp;
  window.__hits=[]; const f=g.hurtPlayerBy.bind(g); g.hurtPlayerBy=(by,fr,st,label)=>{window.__hits.push(label); return f(by,fr,st,label);};});
await place(E.left - 1500, await midY(E.left - 1500)); await p.waitForTimeout(800);
await intoMouth();
ok(await waitFor(()=>!!document.getElementById('cEnter')?.offsetParent, 8000), 'at level 15, swimming into the cave mouth asks "Enter the cave?"');
ok((await p.textContent('#panel h3'))==='Coral Cave' && await G(()=>window.game.scene.isPaused('Game')), 'the prompt names the Coral Cave and the game waits');
await p.screenshot({path:'/tmp/boss_prompt.png'});
await p.click('#cNo'); await p.waitForTimeout(600);
ok(!(await prompt()) && !(await G(()=>window.game.scene.isPaused('Game'))) && await G((l)=>window.game.scene.getScene('Game').player.x < l, E.left), '"Not now" keeps you outside and the game goes on');
ok(!(await boss()), 'no eel without going in');

// Away and back: asked again; Enter: inside the arena, the eel appears.
await place(E.left - 1500, await midY(E.left - 1500)); await p.waitForTimeout(800);
await intoMouth();
ok(await waitFor(()=>!!document.getElementById('cEnter')?.offsetParent, 8000), 'swim away and back, and it asks again');
await p.click('#cEnter'); await p.waitForTimeout(600);
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.arena?.id==='electric_eel' && g.player.x > g.arena.left;}), 'Enter takes you inside the cave');
ok(await G((E)=>{const c=window.game.scene.getScene('Game').cameras.main; return c.useBounds && Math.round(c._bounds.x)===E.left && Math.round(c._bounds.width)===E.right-E.left;}, E), 'the camera stays in the cave: it is its own arena');
ok(await waitFor(async()=>!!window.game.scene.getScene('Game').bosses.current, 8000), 'the Electric Eel appears');
ok(await waitFor(()=>window.__ban.some(t=>t.includes('ELECTRIC EEL')), 8000), 'with a banner');
ok(await G(()=>window.game.scene.getScene('Hud').bossName?.visible), 'and a boss health bar');
ok(await waitFor(()=>window.game.scene.getScene('Game').regionDark > 0.3, 15000), 'the cave is dim inside');
const b0 = await boss();
ok(b0.max > 0 && b0.hp === b0.max, `it has full health (${Math.round(b0.max)})`);
await p.screenshot({path:'/tmp/boss_cave.png'});

// Other fish are kept out of the arena.
await G((E)=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.brain && !c.boss && c.fish.active && !c.asleep); c.away=false; c.crowded=false; window.__intruder=c; c.fish.arcadeBody.reset((E.left+E.right)/2, g.chamberMidY(null, (E.left+E.right)/2));}, E);
ok(await waitFor((E)=>{const f=window.__intruder.fish; return f.x < E.left || f.x > E.right;}, 6000, E), 'a fish that wanders in is put back outside');

// Shock: it crackles first (a warning), then a ring hurts you if you are close.
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; const a=g.bosses.active; a.shockIn=0; a.breathIn=99;
  const x=Math.min(g.arena.right-60, Math.max(g.arena.left+60, c.fish.x + (c.fish.x + 120 < g.arena.right - 60 ? 120 : -120))); g.player.arcadeBody.reset(x, c.fish.y);});
ok(await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='charge', 6000), 'it charges up before a shock (the warning)');
await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; const x=Math.min(g.arena.right-60, Math.max(g.arena.left+60, c.fish.x + (c.fish.x + 120 < g.arena.right - 60 ? 120 : -120))); g.player.arcadeBody.reset(x, c.fish.y);});
await p.screenshot({path:'/tmp/boss_charge.png'});
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); const c=g.bosses.current; if (c && g.arena && !window.__hits.includes('ZAP!')) g.player.arcadeBody.reset(Math.min(g.arena.right-60, Math.max(g.arena.left+60, c.fish.x + (c.fish.x + 100 < g.arena.right - 60 ? 100 : -100))), c.fish.y);
  return window.__hits.includes('ZAP!');}, 25000), 'the shock hits you if you stay close ' + JSON.stringify(await G(()=>{const a=window.game.scene.getScene('Game').bosses.active; return a ? {mode:a.mode, t:a.t, shockIn:a.shockIn, hits:window.__hits} : null;})));

// Breath: it rises to the air hole and gulps; bites do double damage then.
await G(()=>{const g=window.game.scene.getScene('Game'); const a=g.bosses.active; a.breathIn=0; a.shockIn=99; const x=g.arena.left+300; g.player.arcadeBody.reset(x, g.chamberMidY(null, x));});
ok(await G(()=>window.game.scene.getScene('Game').arena !== null), 'still inside the arena for the breathing test');
const gulped = await waitFor(()=>window.game.scene.getScene('Game').bosses.current?.brain.mode==='gulp', 30000);
if (!gulped) console.log('boss now', JSON.stringify(await boss()));
ok(gulped, 'it swims up to the air hole and gulps air');
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.bosses.damageMulAgainst(g.bosses.current) > 1;}), 'while it gulps, your bites do extra damage');
await p.screenshot({path:'/tmp/boss_gulp.png'});

// Swim out of a mouth: you leave the arena; the fight pauses and it heals.
await G(()=>{const g=window.game.scene.getScene('Game'); g.bosses.current.fish.hp = g.bosses.current.fish.maxHp * 0.5;});
await place(E.left - 40, await midY(E.left - 40));
ok(await waitFor(()=>window.game.scene.getScene('Game').arena===null, 5000), 'swimming out of a cave mouth leaves the arena');
ok(await G(()=>{const c=window.game.scene.getScene('Game').cameras.main; return c._bounds.width > 50000;}), 'and the camera follows the whole sea again');
ok(await waitFor(()=>!window.game.scene.getScene('Hud').bossName?.visible, 5000), 'the boss bar hides');
ok(await waitFor(()=>{const c=window.game.scene.getScene('Game').bosses.current; return c && c.fish.hp > c.fish.maxHp * 0.55;}, 10000), 'and it slowly heals while you are gone');

// Losing inside: no game over; you wake up outside with some health, and the eel is back to full.
const enter = async ()=>{ await place(E.left - 1500, await midY(E.left - 1500)); await p.waitForTimeout(800); await intoMouth();
  await waitFor(()=>!!document.getElementById('cEnter')?.offsetParent, 8000); await p.click('#cEnter'); await p.waitForTimeout(500); };
await enter();
ok(await G(()=>window.game.scene.getScene('Game').arena!==null), 'back inside');
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.hp=1; g.playerDied(g.bosses.current, 'bitten');});
await p.waitForTimeout(500);
const lost = await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player, c=g.bosses.current; return {dead:g.dead, arena:g.arena, x:pl.x, hp:pl.hp/pl.maxHp, boss:c?c.fish.hp/c.fish.maxHp:null};});
ok(!lost.dead && lost.arena===null && lost.x < E.left, 'losing to the eel does not end the run: you wake up outside the cave '+JSON.stringify(lost));
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
