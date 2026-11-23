// Enemy spawn factors in the game: schools and packs, time of day, waves, respawn delay, elites,
// the hunter cap, more enemies each Tide, and the grouped Enemy settings page.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1024,height:1366}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
// Slow machines run the game clock slower: poll instead of fixed waits.
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };

await p.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded', timeout: 90000 }); await G(()=>localStorage.clear()); await p.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 20000);

// The Enemy settings page groups the factors.
await p.click('#cardOptions'); await p.click('#oEnemies');
await waitFor(()=>document.querySelectorAll('[data-enemy]').length > 10, 5000);
await p.click('[data-enemy="anglerfish"]');
await waitFor(()=>!!document.getElementById('en_sf_activity_night'), 5000);
const groups = await G(()=>[...document.querySelectorAll('.en-group')].map(h=>h.textContent));
ok(JSON.stringify(groups)===JSON.stringify(['When','Where','How many','Variety','Strength and behavior']), 'Enemy settings shows the factors in sections: '+groups.join(', '));
const nFields = await G(()=>document.querySelectorAll('.en-field input[type=range]').length);
ok(nFields >= 26, `every factor has a slider (${nFields})`);
ok(await G(()=>+document.getElementById('en_sf_activity_day').value < +document.getElementById('en_sf_activity_night').value), 'the anglerfish is out more at night than by day');
await p.screenshot({path:'/home/claude/stages/enemy_factors.png'});
await G(()=>document.getElementById('enBack2').click()); await p.waitForTimeout(200);
await G(()=>document.querySelector('#enBack')?.click()); await p.waitForTimeout(200);
await G(()=>document.querySelector('#oBack, [data-back]')?.click());
await p.reload();
await waitFor(()=>document.getElementById('home')?.classList.contains('open'), 20000);
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30)));
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player;}, 15000);

// Schools: most blue tangs have another tang close by.
const school = await G(()=>{const g=window.game.scene.getScene('Game'); const t=g.creatures.filter(c=>c.fish.species.id==='blue_tang');
  let near=0; for (const a of t) if (t.some(o=>o!==a && Math.hypot(o.fish.x-a.fish.x,o.fish.y-a.fish.y)<400)) near++; return near/t.length;});
ok(school > 0.8, `blue tangs swim in schools (${Math.round(school*100)}% have a mate close by)`);

// Respawn delay: an eaten grey shark stays away for a while.
const resp = await G(()=>{const g=window.game.scene.getScene('Game'); const c=g.creatures.find(c=>c.fish.species.id==='grey_shark'&&!c.away); g.respawnAmbient(c); window.__shark=c; return c.respawnT;});
ok(resp >= 19, `an eaten grey shark comes back only after its respawn delay (${resp}s)`);
ok(await waitFor(()=>window.__shark.asleep && !window.__shark.fish.visible, 3000), 'meanwhile it is hidden');

// Elites: a rare golden one, stronger.
const elite = await G(()=>{const g=window.game.scene.getScene('Game'); const f=g.factorsOf('red_grouper'); const old=f.eliteChance; f.eliteChance=1;
  const c=g.creatures.find(c=>c.fish.species.id==='red_grouper'&&!c.away); g.respawnAmbient(c); f.eliteChance=old; c.respawnT=0;
  return {elite:c.fish.elite, tint:c.fish.tintTopLeft, level:c.fish.level, normalMax:f.levelMax+g.aiLevelBonus};});
ok(elite.elite && elite.tint===0xffe27a && elite.level > elite.normalMax, 'an elite is golden and stronger than any normal one: '+JSON.stringify(elite));

// Hunter cap: at most one great white chases you at once.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(25); g.spawnUnlocked();});
await waitFor(()=>window.game.scene.getScene('Game').creatures.filter(c=>c.fish.species.id==='great_white').length>=2, 8000);
await G(()=>{const g=window.game.scene.getScene('Game'), pl=g.player; pl.invulnTimer=1e9;
  window.__gw = g.creatures.filter(c=>c.fish.species.id==='great_white').slice(0,3);
  window.__gw.forEach((c,i)=>{ c.away=false; c.respawnT=0; c.fish.arcadeBody.reset(pl.x+200+i*60, pl.y); c.brain.hunger=0.1; c.brain.target=g.playerCreature; c.brain.state='hunt'; });});
await p.waitForTimeout(800);
const hunters = await G(()=>{const g=window.game.scene.getScene('Game'); return g.creatures.filter(c=>c.fish.species.id==='great_white'&&c.brain.state==='hunt'&&c.brain.target===g.playerCreature).length;});
ok(hunters <= 1, `at most one great white hunts you at once (${hunters})`);

// Time of day: fewer anglerfish are out by day than at night.
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(21); g.spawnUnlocked();});
// (The factors are checked once a second of game time; slow test machines run the game in slow motion, so ask now.)
const refresh = async () => { await G(()=>{window.game.scene.getScene('Game').spawnTimer = 0;}); await waitFor(()=>window.game.scene.getScene('Game').spawnTimer > 0.5, 10000); };
const out = async (period) => { await G((pd)=>{const g=window.game.scene.getScene('Game'); g.dayTime=g.dayNight.startOf(pd)+20;}, period);
  await waitFor((pd)=>window.game.scene.getScene('Game').period===pd, 10000, period);
  await refresh();
  return G(()=>{const g=window.game.scene.getScene('Game'); const a=g.creatures.filter(c=>c.fish.species.id==='anglerfish'); return a.filter(c=>!c.away).length/a.length;}); };
const day = await out('day'), night = await out('night');
ok(night > day + 0.3 && night > 0.9, `anglerfish: ${Math.round(day*100)}% out by day, ${Math.round(night*100)}% at night`);

// Waves: barracuda come and go.
const wave = await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(22); g.spawnUnlocked(); const f=g.factorsOf('barracuda'); return {every:f.waveEvery, stay:f.waveStay};});
await G((w)=>{window.game.scene.getScene('Game').runTime = w.stay + 5;}, wave);
await refresh();
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); const a=g.creatures.filter(c=>c.fish.species.id==='barracuda'); return a.length>0 && a.every(c=>c.away);}, 5000), 'between waves, the barracuda pack is gone');
await G((w)=>{window.game.scene.getScene('Game').runTime = w.every + 1;}, wave);
await refresh();
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return g.creatures.some(c=>c.fish.species.id==='barracuda'&&!c.away);}, 5000), 'and the next wave brings them back');

// More each Tide: grey sharks grow in number.
const before = await G(()=>window.game.scene.getScene('Game').creatures.filter(c=>c.fish.species.id==='grey_shark').length);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(41);});
await refresh();
ok(await waitFor((n)=>window.game.scene.getScene('Game').creatures.filter(c=>c.fish.species.id==='grey_shark').length > n, 10000, before), `more grey sharks in a later Tide (${before} -> ${await G(()=>window.game.scene.getScene('Game').creatures.filter(c=>c.fish.species.id==='grey_shark').length)})`);

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
