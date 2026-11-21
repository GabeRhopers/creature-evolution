import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const S=()=>G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player;return {lv:pl.level, stage:pl.stage?.id, size:+pl.size.toFixed(1), rank:+pl.rank.toFixed(1), tex:pl.texture.key, hp:Math.round(pl.hp), maxHp:pl.maxHp, ability:g.ability.label, dead:g.dead}});
const shot=async(n,z=2)=>{await G((z)=>{const g=window.game.scene.getScene('Game');g.cameras.main.setZoom(z)},z); await p.waitForTimeout(300); await p.screenshot({path:'/home/claude/stages/'+n+'.png'});};
await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
ok((await p.textContent('#chain')).includes('bite it'), 'food chain on home shows sharks as bite-only: '+(await p.textContent('#chain')).replace(/\s+/g,' '));
await G(()=>window.addEventListener('ce:perk',()=>setTimeout(()=>document.querySelector('[data-perk]')?.click(),30))); // this test skips through levels: pick perks automatically
await p.click('#btnPlay'); await p.waitForTimeout(1500);
let s=await S(); console.log(JSON.stringify(s));
ok(s.stage==='hatchling' && s.tex==='stage_hatchling' && s.ability==='SHELL', 'starts as a hatchling in its egg, ability SHELL');
await shot('st_hatch',3);
// Shell Guard blocks a bite
await G(()=>{const g=window.game.scene.getScene('Game'); g.controller.uiDash=true;}); await p.waitForTimeout(150);
ok(await G(()=>window.game.scene.getScene('Game').shellActive), 'Shell Guard is up');
await shot('st_shell',3);
const hpBefore=(await S()).hp;
await G(()=>{const g=window.game.scene.getScene('Game'); const shark=g.creatures.find(c=>c.fish.species.id==='grey_shark'); g.attackPlayer(shark);});
s=await S(); ok(s.hp===hpBefore, 'a shark bite bounces off the shell');
ok(!(await G(()=>window.game.scene.getScene('Game').shellActive)), 'shell used up by the block');
// level up within the stage: size grows a little
const size1=s.size;
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.invulnTimer=0; g.grantXp(g.player.xpNeeded*1.01);}); 
s=await S(); ok(s.lv===2 && s.size>size1 && s.size<size1*1.05, `level 2 grows a little: ${size1} -> ${s.size}`);
// jump to level 10, then evolve to juvenile
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(10); g.player.hp=g.player.maxHp*0.4; g.grantXp(g.player.xpNeeded+1);}); await p.waitForTimeout(200);
s=await S(); console.log(JSON.stringify(s));
ok(s.lv===11 && s.stage==='juvenile' && s.tex==='stage_juvenile', 'evolved into a juvenile at level 11');
ok(s.hp===s.maxHp, 'evolution heals fully');
ok(s.ability==='LUNGE', 'juvenile ability is LUNGE');
await p.waitForTimeout(400); await p.screenshot({path:'/home/claude/stages/st_evolve.png'});
ok(await G(()=>window.game.scene.getScene('Hud').banner.text.includes('EVOLVED')), 'evolution banner shown');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.level===11), 'evolution writes a checkpoint');
await p.waitForTimeout(2500); await shot('st_juv',2);
// to adult and Death Roll
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(20); g.grantXp(g.player.xpNeeded+1);}); await p.waitForTimeout(3000);
s=await S(); ok(s.stage==='adult' && s.ability==='ROLL' && s.tex==='stage_adult', 'evolved into an adult with ROLL');
await shot('st_adult',1.6);
const roll = await G(()=>{const g=window.game.scene.getScene('Game'),pl=g.player; const t=g.creatures.find(c=>c.brain&&c.fish.species.id==='red_grouper'); const m=pl.mouthPoint(); t.fish.setPosition(m.x+t.fish.size*0.3,m.y); const hp=t.fish.hp; g.controller.uiDash=true; return {hp, id:t.fish.species.id, ref:g.creatures.indexOf(t), kills:g.stats.kills};});
await p.waitForTimeout(200);
const after = await G((i)=>{const g=window.game.scene.getScene('Game'); const t=g.creatures[i]; return {hp:t.fish.hp, alive:t.fish.active, stunned:t.fish.stunned, cd:g.abilityCooldown, kills:g.stats.kills};}, roll.ref);
ok(after.cd>0 && (after.hp<roll.hp || after.kills>roll.kills), `Death Roll hits the ${roll.id} (kills ${roll.kills} -> ${after.kills})`);
// reef reacts: sharks do not hunt the adult, they hunted the juvenile
const reacts = await G(()=>{const g=window.game.scene.getScene('Game'); const sh=g.creatures.find(c=>c.fish.species.id==='grey_shark'); sh.fish.setLevel(1); const pc=g.playerCreature;
  const adult = sh.brain.isThreat ? null : null;
  g.player.setLevel(15); const juvThreat = sh.brain['isThreat'](pc) , juvBite = sh.brain.canBite(pc);
  g.player.setLevel(30); const adultBite = sh.brain.canBite(pc); const sharkFears = sh.brain['isThreat'].call(sh.brain, pc);
  return {juvBite, adultBite, sharkFears};});
console.log(JSON.stringify(reacts));
ok(reacts.juvBite && !reacts.adultBite, 'sharks bite juveniles but not adults');
ok(reacts.sharkFears, 'a grown adult scares sharks');
// level cap
await G(()=>{const g=window.game.scene.getScene('Game'); g.grantXp(1e6);}); s=await S();
ok(s.lv===30, 'level stays at 30 (max)');
// death as an adult -> swim again from 21; checkpoint at 21
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(24); g.playerDied(null,'starved');}); await p.waitForTimeout(1500);
ok((await G(()=>window.game.scene.getScene('Hud').deathAgain.text)).includes('21'), 'death screen offers SWIM AGAIN FROM LEVEL 21');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.level===21), 'stage checkpoint saved at level 21');
await p.screenshot({path:'/home/claude/stages/st_dead.png'});
await G(()=>window.game.scene.getScene('Hud').respawn()); await p.waitForTimeout(1500);
s=await S(); ok(s.lv===21 && s.stage==='adult' && !s.dead && s.hp===s.maxHp, 'back as a level 21 adult with full health');
// hatchling death -> level 1, no checkpoint
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(5); g.playerDied(null,'starved');}); await p.waitForTimeout(300);
ok(await G(()=>localStorage.getItem('ce.save.checkpoint')===null), 'hatchling death leaves no checkpoint');
console.log('errors', errs); await b.close();
