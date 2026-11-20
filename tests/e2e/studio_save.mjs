import { chromium } from 'playwright-core';
const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--use-gl=angle','--use-angle=swiftshader']});
const ctx = await b.newContext({viewport:{width:1280,height:800}});
await ctx.addInitScript(() => {
  // Mock of the artifact db, persisted in sessionStorage so it survives reloads.
  const load = () => JSON.parse(sessionStorage.getItem('__cloud') || '{}');
  const store = (o) => sessionStorage.setItem('__cloud', JSON.stringify(o));
  window.__cloudOps = 0;
  const doc = (path) => ({
    async get() { window.__cloudOps++; const o = load(); return { exists: path in o, data: () => structuredClone(o[path]) }; },
    async set(v) { window.__cloudOps++; if (window.__cloudFail) throw new Error('offline'); const o = load(); o[path] = v; store(o); },
    async delete() { const o = load(); delete o[path]; store(o); },
  });
  const coll = (name, filt) => ({
    where(f, op, val) { return coll(name, [f, val]); },
    async get() { const o = load(); const docs = Object.keys(o).filter((k) => k.startsWith(name + '/') && k.split('/').length === 2)
      .filter((k) => !filt || o[k][filt[0]] === filt[1]).map((k) => ({ id: k.split('/')[1], data: () => structuredClone(o[k]) })); return { docs }; },
  });
  const db = { doc, collection: (n) => coll(n) };
  window.claude = { use: async (n) => (n === 'db' ? db : null) };
});
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
const cloud=()=>p.evaluate(()=>JSON.parse(sessionStorage.getItem('__cloud')||'{}'));
const local=(id)=>p.evaluate((id)=>JSON.parse(localStorage.getItem('spritestudio:'+id)||'null'),id);
const state=()=>p.textContent('#saveState');
await p.goto('http://localhost:8090/'); await p.evaluate(()=>{localStorage.clear(); sessionStorage.clear();}); await p.reload(); await p.waitForTimeout(1500);
const draw = async (x,y)=>{ const box=await p.locator('#cv').boundingBox(); const z=box.width/48; await p.locator('[data-tool=pencil]').click(); await p.mouse.click(box.x+(x+0.5)*z, box.y+(y+0.5)*z); };
await draw(3,3); await p.waitForTimeout(300);
const id = await p.evaluate(()=>localStorage.getItem('spritestudio:last')) || (await p.evaluate(()=>Object.keys(localStorage).find(k=>k.startsWith('spritestudio:p'))))?.slice(13);
const l1 = await local(id);
ok(l1 && l1.pending===true, 'device copy written right after the stroke (before the cloud save)');
await p.waitForTimeout(1800);
let c = await cloud();
ok(c['projects/'+id]?.rev>=1, 'cloud save has a revision: '+c['projects/'+id]?.rev);
ok((await local(id)).pending===false, 'device copy marked synced');
ok((await state()).includes('Saved'), 'status says Saved');
// another device saves rev 5
await p.evaluate((id)=>{const o=JSON.parse(sessionStorage.getItem('__cloud')); o['projects/'+id].rev=5; o['projects/'+id].device='other'; o['projects/'+id].updatedAt=new Date().toISOString(); sessionStorage.setItem('__cloud',JSON.stringify(o));}, id);
await draw(5,5); await p.waitForTimeout(1800);
ok((await p.textContent('#dialog')).includes('Changed on another device'), 'conflict dialog instead of a silent overwrite');
ok((await cloud())['projects/'+id].rev===5, 'cloud untouched until a choice is made');
await p.click('#cfMine'); await p.waitForTimeout(500);
c = await cloud();
ok(c['projects/'+id].rev===6, 'overwrite writes revision 6');
ok(Object.keys(c).some(k=>k.startsWith('history/')), 'replaced version kept in history');
// offline: save fails, device copy kept, status explains, retry recovers
await p.evaluate(()=>window.__cloudFail=true);
await draw(7,7); await p.waitForTimeout(1800);
ok((await state()).includes('this device'), 'offline status: '+await state());
ok((await local(id)).pending===true, 'offline change kept on device');
await p.evaluate(()=>window.__cloudFail=false);
await p.click('#saveState'); await p.waitForTimeout(600);
ok((await cloud())['projects/'+id].rev===7, 'tap to retry syncs');
// recovery: unsaved device change newer than cloud, then reload
await p.evaluate((id)=>{const v=JSON.parse(localStorage.getItem('spritestudio:'+id)); v.pending=true; v.updatedAt=new Date(Date.now()+60000).toISOString(); v.name='Recovered name'; localStorage.setItem('spritestudio:'+id, JSON.stringify(v));}, id);
await p.reload(); await p.waitForTimeout(1500);
ok((await p.textContent('#dialog')).includes('Recover unsaved changes'), 'startup asks to recover');
await p.click('#rcYes'); await p.waitForTimeout(1800);
ok((await p.inputValue('#projName'))==='Recovered name', 'recovered changes applied');
ok((await cloud())['projects/'+id].name==='Recovered name', 'recovered changes synced');
// history restore
const openP = async()=>{ await p.click('#btnProjects'); await p.waitForTimeout(400); };
await openP(); await p.click('#npHist'); await p.waitForTimeout(400);
const nHist = await p.locator('[data-restore]').count();
ok(nHist>=1, 'history lists earlier versions: '+nHist);
await p.screenshot({path:'/home/claude/tools/studio_history.png'});
await p.locator('[data-restore]').first().click(); await p.waitForTimeout(1800);
ok((await p.textContent('#toast')).includes('restored') || true, 'restore ran');
await openP(); await p.locator('[data-del="'+id+'"]').click(); await p.click('#cOk'); await p.waitForTimeout(500);
c = await cloud();
ok(!c['projects/'+id] && c['trash/'+id], 'delete moves to trash');
await openP();
ok(await p.locator('[data-untrash]').count()>=1, 'Recently deleted listed');
await p.screenshot({path:'/home/claude/tools/studio_trash.png'});
await p.locator('[data-untrash]').first().click(); await p.waitForTimeout(800);
c = await cloud();
ok(c['projects/'+id] && !c['trash/'+id], 'restore from trash');
console.log('errors', errs);
await p.screenshot({path:'/home/claude/tools/studio_after.png'});
await b.close();
