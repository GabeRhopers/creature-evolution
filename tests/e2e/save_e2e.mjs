import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const ctx = await b.newContext({viewport:{width:1280,height:800}});
const p = await ctx.newPage();
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const st=()=>G(()=>{const g=window.game.scene.getScene('Game');return {menu:g.menuMode, dead:g.dead, level:g.player.level, hp:Math.round(g.player.hp), maxHp:g.player.maxHp, stomach:+g.stomach.ratio.toFixed(2), x:Math.round(g.player.x), y:Math.round(g.player.y), invuln:+g.player.invulnTimer.toFixed(2), runTime:Math.round(g.runTime), kills:g.stats.kills, diff:g.difficultyName}});
await p.goto('http://localhost:4173/'); await p.waitForTimeout(3500);
// legacy migration: old keys present before first load of this version
await G(()=>{localStorage.clear(); localStorage.setItem('ce.options',JSON.stringify({music:false,sfx:true,difficulty:'hard'})); localStorage.setItem('ce.best',JSON.stringify({level:4,kills:1,fish:3}));});
await p.reload(); await p.waitForTimeout(3500);
ok(await p.textContent('#bestLine').then(t=>t.includes('level 4')), 'old best record migrated');
ok(await G(()=>document.querySelector('[data-diff=hard]').getAttribute('aria-pressed'))==='true', 'old difficulty migrated');
ok(await G(()=>document.getElementById('btnContinue').hidden), 'no Continue on a fresh device');
await p.click('#btnPlay'); await p.waitForTimeout(1500);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(6); g.player.hp=g.player.maxHp*0.6; g.stomach.setLevel(6); g.stomach.fill=g.stomach.capacity*0.42; g.stats.kills=3; g.player.setPosition(1500,900);});
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
ok((await p.textContent('.saved-line')).includes('Saved'), 'pause shows Saved');
const before = await st(); console.log('before', JSON.stringify(before));
// reload mid-run
await p.reload(); await p.waitForTimeout(3500);
ok(!(await G(()=>document.getElementById('btnContinue').hidden)), 'Continue shown after reload');
console.log('continue sub:', await p.textContent('#continueSub'), '| play:', await p.textContent('#btnPlay'));
await p.click('#btnContinue'); await p.waitForTimeout(250);
// Slow runners: poll (up to 5 s) until the run is back in play.
let after = await st();
for (let i=0;i<100 && (after.menu || after.level!==6);i++){ await p.waitForTimeout(50); after = await st(); } console.log('after ', JSON.stringify(after));
ok(after.level===6 && after.hp>=before.hp-1 && after.hp-before.hp<=6 && Math.abs(after.stomach-before.stomach)<0.03 && after.kills===3 && after.diff==='hard', 'level, health, stomach, kills, difficulty restored');
ok(Math.abs(after.x-1500)<40 && Math.abs(after.y-900)<40, 'position restored');
ok(after.invuln>1, 'resume shield active');
// tab hidden -> paused + saved
await G(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange'));});
await p.waitForTimeout(300);
ok(await G(()=>window.game.scene.isPaused('Game')), 'hiding the tab pauses');
await G(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange'));});
await p.click('#pResume'); await p.waitForTimeout(300);
// corrupt main slot -> backup used with a notice
await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(600);
await G(()=>{const k='ce.save.run.p1.crocodile.1'; localStorage.setItem(k, localStorage.getItem(k).slice(0,30));});
await p.reload(); await p.waitForTimeout(3500);
ok(!(await G(()=>document.getElementById('btnContinue').hidden)), 'damaged save falls back to backup');
ok(await G(()=>document.getElementById('notice').classList.contains('open')), 'player told about the damaged save');
// error safety net
await p.click('#noticeClose'); await p.click('#btnContinue'); await p.waitForTimeout(500);
await G(()=>setTimeout(()=>{throw new Error('test boom')},0)); await p.waitForTimeout(500);
ok((await p.textContent('#panel')).includes('Something went wrong'), 'error panel appears');
ok(await G(()=>window.ceDiagnostics().errors.some(e=>e.msg.includes('test boom'))), 'error logged on device');
await p.click('#eResume'); await p.waitForTimeout(300);
ok(!(await G(()=>window.game.scene.isPaused('Game'))), 'Keep playing resumes');
// death clears the checkpoint
await G(()=>window.game.scene.getScene('Game').playerDied(null,'starved')); await p.waitForTimeout(500);
ok(await G(()=>localStorage.getItem('ce.save.run.p1.crocodile.1')===null), 'death clears the saved run');
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.profile')).data.lifetime.deaths.starved===1), 'lifetime death counted');
// new run confirmation when a save exists
await G(()=>{const g=window.game.scene.getScene('Game'); g.restartRun();}); await p.waitForTimeout(1500);
await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(800);
ok(!(await G(()=>document.getElementById('btnContinue').hidden)), 'Home keeps the run for later');
await p.click('#btnPlay'); await p.waitForTimeout(300);
ok((await p.textContent('#panel')).includes('Start a new run?'), 'new run asks before replacing a save');
await p.screenshot({path:'/home/claude/tools/save_confirm.png'});
await p.click('#pKeep'); await p.waitForTimeout(200);
await p.screenshot({path:'/home/claude/tools/save_home.png'});
// blocked storage
const p2 = await ctx.newPage(); await p2.addInitScript(()=>{const t=()=>{throw new Error('blocked')}; Storage.prototype.setItem=t; Storage.prototype.getItem=t;});
const e2=[]; p2.on('pageerror',e=>e2.push(e.message));
await p2.goto('http://localhost:4173/'); await p2.waitForTimeout(3500);
await p2.click('#btnPlay'); await p2.waitForTimeout(1200);
ok(await p2.evaluate(()=>!window.game.scene.getScene('Game').menuMode), 'game runs with storage blocked');
ok(e2.length===0, 'no errors with storage blocked '+e2.join('|'));
console.log('page errors (expected only test boom):', errs);
await b.close();
