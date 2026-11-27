// The Fisher Ape (Nov 27): he rows in, casts, his hook catches a small fish (he celebrates), hooks a small hero (a hit, pulled
// up until EAT bites the line), only stings an adult (the line snaps), and three rams into the boat scare him off.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (fn, ms, arg) => { for (let t = 0; t < ms; t += 100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };

await p.goto('http://localhost:4173/'); await G(() => localStorage.clear()); await p.reload();
await waitFor(() => document.getElementById('home')?.classList.contains('open'), 60000);
await G(() => window.addEventListener('ce:perk', () => setTimeout(() => document.querySelector('[data-perk]')?.click(), 30)));
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.fisher; }, 30000);
ok(await G(() => window.game.scene.getScene('Game').fisher.state === 'away'), 'he is not there at the start of a run');

// Keep the hero still near the surface; he rows in from the right.
const still = () => G(() => { const g = window.game.scene.getScene('Game'), pl = g.player; pl.arcadeBody.setVelocity(0, 0); });
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(g.player.x, 420); g.fisher.spawnNow(1); });
ok(await G(() => window.game.scene.getScene('Game').fisher.state === 'arrive'), 'he rows in');
ok(await waitFor(() => ['drop', 'wait'].includes(window.game.scene.getScene('Game').fisher.state), 30000), 'he casts and the hook drops');
const look = await G(() => { const g = window.game.scene.getScene('Game'); return g.children.list.some((o) => o.texture?.key === 'look_beast-fisher_ape') && g.children.list.some((o) => o.texture?.key === 'w_float_rowboat'); });
ok(look, 'the ape (his own drawing) sits in a rowboat');
await p.screenshot({ path: '/tmp/fisher.png' });

// A small fish touching the hook is reeled up and caught.
const fish = await G(() => {
  const g = window.game.scene.getScene('Game'), f = g.fisher;
  const c = g.creatures.find((c) => !c.isPlayer && c.brain && !c.asleep && !c.away && c.fish.size <= f.cfg.catchMaxSize && !c.fish.species.friendly);
  window.__c = c;
  c.fish.setPosition(f.hookX, f.hookY); c.fish.arcadeBody.setVelocity(0, 0);
  return c.fish.species.id;
});
ok(await waitFor(() => { const f = window.game.scene.getScene('Game').fisher; if (f.state === 'wait' || f.state === 'drop') { window.__c.fish.setPosition(f.hookX, f.hookY); } return f.catches >= 1; }, 30000), `a small fish on the hook is caught (${fish})`);
ok(await G(() => window.game.scene.getScene('Game').fisher.state === 'catch'), 'he celebrates the catch');

// The hero (a hatchling) on the hook: a hit, then pulled up; EAT bites the line.
ok(await waitFor(() => ['drop', 'wait'].includes(window.game.scene.getScene('Game').fisher.state), 30000), 'he casts again');
// The hook well under the surface, so the pull can be seen (slow machines run few frames).
const hp0 = await G(() => { const g = window.game.scene.getScene('Game'), pl = g.player, f = g.fisher; f.state = 'wait'; f.timer = 30; f.hookY = 450; pl.hp = pl.maxHp; pl.invulnTimer = 0; return pl.hp; });
ok(await waitFor(() => { const g = window.game.scene.getScene('Game'), f = g.fisher, pl = g.player; if (!f.hookedPlayer) { pl.setPosition(f.hookX, f.hookY); pl.arcadeBody.setVelocity(0, 0); } return f.hookedPlayer; }, 20000), 'touching the hook hooks a hatchling');
const hooked = await G(() => { const g = window.game.scene.getScene('Game'); return { hp: g.player.hp, y: g.player.y }; });
ok(hooked.hp < hp0 && hooked.hp > 0, `a hit (${Math.round(hp0)} -> ${Math.round(hooked.hp)})`);
// Watch every frame while hooked: the hero rises toward the boat (the reel is fast, so sample in the page).
const rise = await G(() => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), f = g.fisher, pl = g.player, y0 = pl.y;
  let minY = y0, n = 0;
  const tick = () => { minY = Math.min(minY, pl.y); if (!f.hookedPlayer || n++ > 40) res({ y0, minY }); else requestAnimationFrame(tick); };
  tick();
}));
ok(rise.minY < rise.y0 - 10, `and pulled up toward the boat (${Math.round(rise.y0)} -> ${Math.round(rise.minY)})`);
// Hooked again, then EAT bites the line.
await G(() => { const g = window.game.scene.getScene('Game'), f = g.fisher; f.state = 'wait'; f.timer = 5; f.hookY = 400; g.player.invulnTimer = 0; });
await G(() => new Promise((res) => { const g = window.game.scene.getScene('Game'), f = g.fisher, pl = g.player; f['rehook'] = 0; const t = () => { if (f.hookedPlayer) return res(); pl.setPosition(f.hookX, f.hookY); pl.arcadeBody.setVelocity(0, 0); requestAnimationFrame(t); }; t(); }));
await p.keyboard.down('Space');
ok(await waitFor(() => !window.game.scene.getScene('Game').fisher.hookedPlayer, 10000), 'EAT bites the line: free');
await p.keyboard.up('Space');

// An adult is too heavy: the hook stings and the line snaps.
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setLevel(25); });
await waitFor(() => !document.querySelector('[data-perk]'), 20000);
ok(await waitFor(() => ['drop', 'wait'].includes(window.game.scene.getScene('Game').fisher.state) || window.game.scene.getScene('Game').fisher.state === 'leave', 40000), 'he fishes again');
const adult = await G(() => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), f = g.fisher, pl = g.player;
  f.hookedPlayer = false; f.state = 'wait'; f.timer = 30; f.hookY = 450; f['rehook'] = 0;
  pl.hp = pl.maxHp; pl.invulnTimer = 0;
  const hp = pl.hp;
  let n = 0;
  const tick = () => { pl.setPosition(f.hookX, f.hookY); pl.arcadeBody.setVelocity(0, 0); if (pl.hp < hp || n++ > 400) res({ hit: pl.hp < hp, hooked: f.hookedPlayer }); else requestAnimationFrame(tick); };
  tick();
}));
ok(adult.hit && !adult.hooked, 'an adult only gets stung (the line snaps): ' + JSON.stringify(adult));

// Three rams into the boat from below scare him off.
await G(() => { const g = window.game.scene.getScene('Game'), f = g.fisher; if (f.state === 'leave' || f.state === 'away') f.spawnNow(1); });
await waitFor(() => window.game.scene.getScene('Game').fisher.state !== 'arrive', 30000);
const xp0 = await G(() => { const g = window.game.scene.getScene('Game'); return g.player.xp + g.player.level * 1e6; });
ok(await waitFor(() => {
  const g = window.game.scene.getScene('Game'), f = g.fisher, pl = g.player;
  if (f.state === 'leave') return true;
  // Swimming up fast into the boat from below.
  pl.setPosition(f.x, 120 + pl.size * 2.2);
  pl.arcadeBody.setVelocity(0, -900);
  return false;
}, 30000), 'three rams into the boat scare him off');
ok(await G((x) => { const g = window.game.scene.getScene('Game'); return g.player.xp + g.player.level * 1e6 > x; }, xp0), 'for a little XP');
ok(await waitFor(() => window.game.scene.getScene('Game').fisher.state === 'away', 30000), 'he rows away and is gone');

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
