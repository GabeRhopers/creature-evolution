import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--mute-audio']});
const p = await b.newPage({viewport:{width:1280,height:800}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const G=(f,a)=>p.evaluate(f,a);
const base='http://localhost:4173/';
// An old (v1) untouched hatchling seed and an edited old adult seed already on this device
await p.goto(base+'studio/index.html'); await G(()=>{localStorage.clear();
  const old={name:'Crocodile 1: Hatchling',w:48,h:24,palette:['#000000','#248e2c'],poses:[{name:'idle',fps:3,frames:['1'.repeat(48*24)]}],rev:1,updatedAt:'2026-11-21T08:45:00.000Z'};
  localStorage.setItem('spritestudio:croc-hatchling', JSON.stringify(old));
  localStorage.setItem('spritestudio:croc-adult', JSON.stringify({...old, name:'Crocodile 3: Adult', rev:5, updatedAt:'2026-11-21T10:12:00.000Z'})); // edited: saving replaced the starter timestamp
  localStorage.setItem('spritestudio.seeded', JSON.stringify(['croc-hatchling','croc-juvenile','croc-adult']));});
await p.reload();
// Seeding runs in the background and loads every starter design; slow runners need longer, so poll (up to 40 s).
for (let t=0; t<40000; t+=500) { if (await G(()=>!!localStorage.getItem('spritestudio:croc-adult-v3') && JSON.parse(localStorage.getItem('spritestudio:croc-hatchling')||'{}').framework==='crocodile')) break; await p.waitForTimeout(500); }
await p.waitForTimeout(1000);
const ids = await G(()=>Object.keys(localStorage).filter(k=>k.startsWith('spritestudio:croc')).map(k=>k.slice(13)).sort());
console.log('projects:', ids.join(', '));
ok(await G(()=>JSON.parse(localStorage.getItem('spritestudio:croc-hatchling')).framework==='crocodile'), 'untouched old hatchling upgraded to the framework design');
ok(await G(()=>JSON.parse(localStorage.getItem('spritestudio:croc-adult')).rev===5), 'edited old adult kept as it was');
ok(ids.includes('croc-adult-v3'), 'new adult design added next to it as a copy');
// open the new adult: framework guides
await p.click('#btnProjects'); await p.waitForTimeout(400); await p.locator('[data-open="croc-adult-v3"]').click(); await p.waitForTimeout(800);
const coords = await p.textContent('#coords');
ok(coords.includes('Crocodile') && coords.includes('80×56') && !coords.includes('margin'), 'guides on, framework shown, nothing in the margin: '+coords);
await p.screenshot({path:'/home/claude/stages/studio_fw.png'});
// draw in the margin -> warning
const box = await p.locator('#cv').boundingBox(); const z = box.width/80;
await p.locator('[data-tool=pencil]').click(); await p.mouse.click(box.x+0.5*z, box.y+0.5*z); await p.waitForTimeout(200);
ok((await p.textContent('#coords')).includes('1 px in the margin'), 'drawing in the margin is flagged');
await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
// move the mouth marker
await p.locator('[data-tool=mouth]').click(); await p.mouse.click(box.x+70.5*z, box.y+30.5*z); await p.waitForTimeout(1600);
ok(await G(()=>{const v=JSON.parse(localStorage.getItem('spritestudio:croc-adult-v3'));return v.mouth[0]===70&&v.mouth[1]===30;}), 'mouth marker saved with the drawing');
// a new project on the Fish framework
await p.click('#btnProjects'); await p.waitForTimeout(400);
await p.selectOption('#npF','fish'); await p.fill('#npName','Test fish'); await p.click('#npGo'); await p.waitForTimeout(1800);
ok((await p.textContent('#coords')).includes('Fish') && (await p.textContent('#coords')).includes('40×32'), 'new project uses the Fish framework');
// switch it to crocodile via Canvas
await p.click('#btnSettings'); await p.waitForTimeout(300); await p.selectOption('#csF','crocodile'); await p.click('#csOk'); await p.waitForTimeout(300);
ok((await p.textContent('#coords')).includes('80×56'), 'Canvas switches the framework and resizes');
console.log('errors', errs); await b.close();
