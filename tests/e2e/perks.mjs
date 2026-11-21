import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const g=()=>'window.game.scene.getScene("Game")';
const panelOpen=()=>G(()=>document.getElementById('panelWrap').classList.contains('open') && !!document.querySelector('[data-perk]'));
const waitPanel=async(ms=8000)=>{const t=Date.now(); while(Date.now()-t<ms){ if(await panelOpen()) return true; await p.waitForTimeout(150);} return false;};
await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);
await p.click('#btnPlay'); await p.waitForTimeout(1200);
const speed0 = await G(()=>window.game.scene.getScene('Game').player.cruiseSpeed);
await G(()=>{const s=window.game.scene.getScene('Game'); s.player.setLevel(3); s.grantXp(s.player.xpNeeded+1);});
ok(await waitPanel(), 'reaching level 4 offers a perk choice');
ok(await G(()=>window.game.scene.isPaused('Game')), 'the game pauses while choosing');
ok((await G(()=>document.querySelectorAll('[data-perk]').length))===3, 'three perks to choose from');
await p.screenshot({path:'/home/claude/stages/perk_panel.png'});
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok(await panelOpen(), 'Escape does not dismiss the choice');
// pick Swift Tail if offered, otherwise the first
const picked = await G(()=>{const b=document.querySelector('[data-perk="swift"]')||document.querySelector('[data-perk]'); const id=b.dataset.perk; b.click(); return id;});
await p.waitForTimeout(300);
ok(!(await panelOpen()) && !(await G(()=>window.game.scene.isPaused('Game'))), 'choosing resumes the game');
const st = await G(()=>{const s=window.game.scene.getScene('Game'); return {perks:s.perks, speed:s.player.cruiseSpeed, mods:s.player.mods, cp:JSON.parse(localStorage.getItem('ce.save.checkpoint')).data.perks};});
console.log('picked', picked, JSON.stringify(st.mods));
ok(st.perks.length===1 && st.perks[0]===picked, 'perk recorded');
ok(JSON.stringify(st.cp)===JSON.stringify([picked]), 'perk saved with the run');
if (picked==='swift') ok(st.speed > speed0*1.05, `Swift Tail makes you faster: ${speed0.toFixed(0)} -> ${st.speed.toFixed(0)}`);
// two levels at once (6 -> 8) earns the level 7 pick; reload before choosing, it is offered again after Continue
await G(()=>{const s=window.game.scene.getScene('Game'); s.player.setLevel(6); s.grantXp(s.player.xpNeeded*1.01);});
ok(await waitPanel(), 'level 7 offers the second pick');
await G(()=>window.game.scene.getScene('Game').checkpoint(true)); // e.g. the app is closed while choosing
await p.reload(); await p.waitForTimeout(3500);
await p.click('#btnContinue');
ok(await waitPanel(), 'an unmade pick is offered again after Continue');
ok((await G(()=>window.game.scene.getScene('Game').perks)).length===1, 'the first perk came back with the save');
await G(()=>document.querySelector('[data-perk]').click()); await p.waitForTimeout(300);
ok((await G(()=>window.game.scene.getScene('Game').perks)).length===2, 'second perk picked');
ok((await G(()=>window.game.scene.getScene('Hud').info.text)).match(/\|\s+\S+\S*$/), 'HUD shows perk icons: '+(await G(()=>window.game.scene.getScene('Hud').info.text)).split('|').pop());
// evolve, die as juvenile, swim again from 11: perks kept
await G(()=>{const s=window.game.scene.getScene('Game'); s.player.setLevel(10); s.grantXp(s.player.xpNeeded+1);}); await p.waitForTimeout(3200);
await G(()=>{const s=window.game.scene.getScene('Game'); s.player.setLevel(13); s.playerDied(null,'starved');}); await p.waitForTimeout(1200);
await G(()=>window.game.scene.getScene('Hud').respawn()); await p.waitForTimeout(1500);
ok((await G(()=>window.game.scene.getScene('Game').perks)).length===2 && (await G(()=>window.game.scene.getScene('Game').player.level))===11, 'swimming again from the stage keeps the perks');
// new run clears them
await G(()=>window.game.scene.getScene('Game').restartRun()); await p.waitForTimeout(1500);
ok((await G(()=>window.game.scene.getScene('Game').perks)).length===0, 'a new run starts with no perks');
// test swims never ask
await p.goto('http://localhost:4173/'); await G(()=>{localStorage.setItem('spritestudio:tst', JSON.stringify({name:'T',w:48,h:24,palette:['#000000'],poses:[{name:'idle',frames:['0'.repeat(48*24)]}]}));});
await p.goto('http://localhost:4173/?try=tst'); await p.waitForTimeout(4000);
await G(()=>{const s=window.game.scene.getScene('Game'); s.player.setLevel(3); s.grantXp(s.player.xpNeeded+1);}); await p.waitForTimeout(1500);
ok(!(await panelOpen()), 'test swims never ask for a perk');
console.log('errors', errs); await b.close();
