// Controller button mapping: Options > Controller buttons, press a button, saved, used in the game.
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
const tap = async (i, ms=500)=>{ await btn(i,true); await p.waitForTimeout(ms); await btn(i,false); await p.waitForTimeout(300); };
const A=0,X=2,Y=3;
const saved = ()=>G(()=>JSON.parse(localStorage.getItem('ce.save.profile')||'{}')?.data?.settings?.padMap ?? null);

await p.goto('http://localhost:4173/'); await G(()=>localStorage.clear()); await p.reload();
await waitFor(()=>document.getElementById('home').classList.contains('open'), 15000);
await p.click('#cardOptions');
await p.click('#oPad');
ok(await waitFor(()=>!!document.querySelector('[data-pm="eat"]'), 3000), 'Options has a Controller buttons page');
ok((await p.textContent('#pmStatus')).includes('Virtual Pad'), 'it names the connected controller');

// Change Eat to X: tap Change, then press X on the controller.
await p.click('[data-pm="eat"][data-mode="set"]');
ok((await p.textContent('#pmStatus')).includes('Press a button'), 'it asks for a button');
await tap(X);
ok(await waitFor(()=>document.getElementById('pm_eat')?.textContent.startsWith('X'), 5000), 'Eat now shows the X button');
ok(await G(()=>!document.getElementById('pm_ability').textContent.includes('X /')), 'X was taken off Ability');
const m = await saved();
ok(m && m.eat.join()==='2' && !m.ability.includes(2), 'the mapping is saved: ' + JSON.stringify(m));

// Add Y to Eat as a second button.
await p.click('[data-pm="eat"][data-mode="add"]');
await tap(Y);
ok(await waitFor(()=>(document.getElementById('pm_eat')?.textContent||'').includes('Y'), 5000), 'Add gives Eat a second button (Y)');

// Kept after a reload, and used in the game.
await p.reload();
await waitFor(()=>document.getElementById('home').classList.contains('open'), 15000);
await p.click('#btnPlay');
await waitFor(()=>{const g=window.game.scene.getScene('Game'); return !g.menuMode && !!g.player;}, 15000);
await btn(X,true);
ok(await waitFor(()=>window.game.scene.getScene('Game').controller.wantsSwallow(), 3000), 'after a reload, X eats in the game');
await btn(X,false);
await btn(A,true); await p.waitForTimeout(600);
ok(!(await G(()=>window.game.scene.getScene('Game').controller.wantsSwallow())), 'A no longer eats');
await btn(A,false);
await btn(X,true); await p.waitForTimeout(200);
ok(await waitFor(()=>window.game.scene.getScene('Hud').hint.text.includes('X / Y eat'), 3000), 'the HUD help line shows the new buttons');
await btn(X,false);

// Back to default.
await G(()=>{ document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); });
await G(()=>window.dispatchEvent(new CustomEvent('ce:home')));
await waitFor(()=>document.getElementById('home').classList.contains('open'), 8000);
await p.click('#cardOptions'); await p.click('#oPad');
await p.click('#pmReset');
ok(await waitFor(()=>{const v=JSON.parse(localStorage.getItem('ce.save.profile')||'{}'); return v?.data?.settings?.padMap === null;}, 3000), 'Default buttons resets the saved mapping');
ok(errs.length===0, 'no page errors '+errs.slice(0,3).join(' | '));
await b.close();
