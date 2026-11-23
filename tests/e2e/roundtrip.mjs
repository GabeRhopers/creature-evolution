import { chromium } from 'playwright-core'; import fs from 'fs';
const croc = JSON.parse(fs.readFileSync(new URL('../../tools/sprite-studio/croc-project.json', import.meta.url)));
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const base='http://localhost:4173/';
await p.goto(base); await G((c)=>{localStorage.clear(); c.updatedAt=new Date().toISOString(); localStorage.setItem('spritestudio:croc', JSON.stringify(c));}, croc);
// a real run in progress, to prove the test swim never touches it
await p.reload(); await p.waitForTimeout(3000);
await p.click('#btnPlay'); await p.waitForTimeout(1200);
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(4);});
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok(await p.locator('#pStudio').isVisible(), 'pause menu has a Sprite Studio button');
await p.click('#pStudio'); await p.waitForURL(/studio/); await p.waitForTimeout(1500);
ok(await p.locator('#btnBack').isVisible() && await p.locator('#btnTry').isVisible(), 'studio shows Game and Try in game');
ok((await p.inputValue('#projName')).length>0, 'studio opened a project: '+await p.inputValue('#projName'));
// select the attack pose, then try in game
await p.locator('#poses button', {hasText:'attack'}).click(); await p.waitForTimeout(200);
await p.click('#btnTry'); await p.waitForURL(/try=/); await p.waitForTimeout(4000);
const st = await G(()=>{const g=window.game.scene.getScene('Game'); return {menu:g.menuMode, test:g.testMode, tex:g.player.texture.key, frame:g.player.frame.name, w:g.player.frame.realWidth, bar:document.getElementById('testBar').classList.contains('open'), name:document.getElementById('testName').textContent};});
console.log(JSON.stringify(st));
const cpBefore = await G(()=>localStorage.getItem('ce.save.checkpoint'));
ok(!st.menu && st.test, 'test swim started');
ok(st.tex==='skin_croc' && st.w===144, 'player wears the studio drawing at the original frame size');
ok(st.bar && st.name.length>0, 'test bar shows the drawing name');
await G(()=>{const g=window.game.scene.getScene('Game'); g.cameras.main.setZoom(2.2);}); await p.waitForTimeout(400);
await p.screenshot({path:'/home/claude/tools/rt_test.png'});
// bite + damage + celebrate frames switch
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.playBite();}); await p.waitForTimeout(60);
const biteF = await G(()=>window.game.scene.getScene('Game').player.frame.name);
ok(biteF.startsWith('skin_croc'), 'bite uses a studio frame: '+biteF);
await G(()=>{const g=window.game.scene.getScene('Game'); g.checkpoint(true); g.player.setLevel(9); g.checkpoint(false);});
ok(await G(()=>localStorage.getItem('ce.save.checkpoint'))===cpBefore, 'test swim never writes the real saved run');
// pause in test -> back to studio on the same pose
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok((await p.textContent('.saved-line')).includes('nothing here is saved'), 'pause explains the test swim');
await p.click('#pStudio'); await p.waitForURL(/studio/); await p.waitForTimeout(1500);
const poseOn = await G(()=>document.querySelector('#poses button[aria-pressed=true], #poses button.on')?.textContent || '');
console.log('pose selected in studio:', poseOn);
ok(/attack/i.test(poseOn), 'back in the studio on the same pose');
// try again, choose "Use this look", then end the test and continue the real run
await p.click('#btnTry'); await p.waitForURL(/try=/); await p.waitForTimeout(4000);
await p.click('#testUse'); await p.waitForTimeout(200);
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.skin)==='croc', 'Use this look saves the choice');
await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(1200);
ok(!(await G(()=>document.getElementById('testBar').classList.contains('open'))), 'test bar closes at home');
ok(!(await G(()=>location.search.includes('try'))), 'address cleaned up');
ok(!(await G(()=>document.getElementById('btnContinue').hidden)), 'real run still waiting under CONTINUE');
await p.click('#btnContinue');
// Slow runners take a while to rebuild the sea: wait for the continued run instead of a fixed pause.
for (let t=0; t<20000; t+=200) { if (await G(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !g.testMode && g.player?.level===4;})) break; await p.waitForTimeout(200); }
const real = await G(()=>{const g=window.game.scene.getScene('Game'); return {lv:g.player.level, tex:g.player.texture.key, test:g.testMode};});
ok(real.lv===4 && !real.test, 'continued the real run at level 4');
ok(real.tex==='skin_croc', 'real run uses the chosen look');
// options picker lists the drawing
await G(()=>window.game.scene.getScene('Game').goHome()); await p.waitForTimeout(800);
await p.click('#cardOptions'); await p.waitForTimeout(800);
const optsList = await G(()=>[...document.querySelectorAll('#oSkin option')].map(o=>o.textContent));
ok(optsList.length>=2, 'Options lists looks: '+optsList.join(', '));
await p.screenshot({path:'/home/claude/tools/rt_options.png'});
await p.selectOption('#oSkin', ''); await p.waitForTimeout(300);
ok(await G(()=>JSON.parse(localStorage.getItem('ce.save.profile')).data.settings.skin)===null, 'switch back to Original');
// broken drawing: refused with a message, original used
await G(()=>{localStorage.setItem('spritestudio:bad', JSON.stringify({name:'Empty',w:48,h:24,palette:['#000000'],poses:[{name:'idle',frames:['.'.repeat(48*24)]}]}));});
await p.goto(base+'?try=bad'); await p.waitForTimeout(3500);
ok(await G(()=>document.getElementById('notice').classList.contains('open')), 'empty drawing explained: '+await p.textContent('#noticeText'));
ok(await G(()=>window.game.scene.getScene('Game').menuMode), 'stays on home instead of a broken swim');
console.log('errors', errs); await b.close();
