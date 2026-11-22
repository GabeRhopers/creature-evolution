// External controller: a virtual pad (navigator.getGamepads replaced before the game loads)
// drives the home screen, swimming, eating, the ability, pause, perk choice and the death screen.
import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const waitFor = async (fn, ms, arg) => { for (let t=0; t<ms; t+=100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
await p.addInitScript(() => {
  const pad = { id: 'Virtual Pad', index: 0, connected: true, mapping: 'standard', axes: [0,0,0,0],
    buttons: Array.from({length:17}, () => ({ pressed:false, touched:false, value:0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
const btn = (i, on=true)=>G(([i,on])=>{window.__pad.buttons[i]={pressed:on,touched:on,value:on?1:0};}, [i,on]);
const tap = async (i, ms=120)=>{ await btn(i,true); await p.waitForTimeout(ms); await btn(i,false); await p.waitForTimeout(ms); };
const stick = (x,y)=>G(([x,y])=>{window.__pad.axes=[x,y,0,0];}, [x,y]);
const A=0,B=1,X=2,START=9,UP=12,DOWN=13;

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload(); await p.waitForTimeout(3500);

// home screen: the D-pad moves a visible focus ring, Start begins the game
await tap(DOWN);
ok(await G(()=>!!document.querySelector('.pad-focus')), 'the D-pad puts a focus ring on a home screen button');
await tap(START);
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player;}, 8000), 'Start on the home screen starts the game');
await p.waitForTimeout(800);

// the HUD help line switches to controller buttons
ok(await waitFor(()=>window.game.scene.getScene('Hud').hint.text.startsWith('Controller:'), 3000), 'the help line shows controller buttons');

// swim with the stick (analog)
const x0 = await G(()=>window.game.scene.getScene('Game').player.x);
await stick(1, 0);
// Slow machines run the game clock slower: hold the stick until the fish has moved (up to 8 s).
await waitFor((x0)=>window.game.scene.getScene('Game').player.x > x0 + 40, 8000, x0);
await stick(0, 0);
const x1 = await G(()=>window.game.scene.getScene('Game').player.x);
ok(x1 > x0 + 40, `the left stick swims (moved ${Math.round(x1-x0)} px right)`);
ok(await G(()=>{const g=window.game.scene.getScene('Game'); return g.controller.read().strength===0;}), 'the stick at rest stops swimming');

// A = eat, B = sprint
await btn(A, true); await p.waitForTimeout(100);
ok(await G(()=>window.game.scene.getScene('Game').controller.wantsSwallow()), 'A eats');
await btn(A, false);
await btn(B, true); await stick(1, 0); await p.waitForTimeout(100);
ok(await G(()=>window.game.scene.getScene('Game').controller.read().sprint), 'B sprints');
await btn(B, false); await stick(0, 0);

// X = stage ability (the hatchling's Shell Guard)
await tap(X);
ok(await waitFor(()=>window.game.scene.getScene('Game').shellActive || window.game.scene.getScene('Game').abilityCooldown>0, 3000), 'X uses the stage ability');

// Start pauses, B resumes
await tap(START);
ok(await waitFor(()=>window.game.scene.isPaused('Game') && document.getElementById('panelWrap').classList.contains('open'), 3000), 'Start pauses');
await tap(DOWN);
ok(await G(()=>!!document.querySelector('#panel .pad-focus')), 'the D-pad moves through the pause menu');
await tap(B);
ok(await waitFor(()=>!window.game.scene.isPaused('Game') && !document.getElementById('panelWrap').classList.contains('open'), 3000), 'B resumes');

// a perk choice: D-pad + A picks; B can't skip it
await G(()=>{const g=window.game.scene.getScene('Game'); g.player.setLevel(3); g.grantXp(g.player.xpNeeded+1);});
ok(await waitFor(()=>!!document.querySelector('[data-perk]'), 8000), 'the perk choice opens');
await tap(B);
ok(await G(()=>!!document.querySelector('[data-perk]') && document.getElementById('panelWrap').classList.contains('open')), 'B does not skip the perk choice');
await tap(DOWN); await tap(A);
ok(await waitFor(()=>window.game.scene.getScene('Game').perks.length===1, 3000), 'D-pad and A pick a perk');

// death screen: A swims again
await G(()=>window.game.scene.getScene('Game').playerDied(null,'starved'));
ok(await waitFor(()=>window.game.scene.getScene('Hud').deathLayer.visible && window.game.scene.getScene('Hud').deathLayer.alpha>0.9, 5000), 'the death screen shows');
ok(await G(()=>window.game.scene.getScene('Hud').deathAgain.text.endsWith('(A)')), 'it names the A button');
await tap(A);
ok(await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.dead && !window.game.scene.getScene('Hud').deathLayer.visible;}, 5000), 'A swims again');
console.log('errors', errs); await b.close();
