// The bite timeline (Rhopers, Nov 27): pressing EAT opens the jaws (wind-up), holding keeps them open (slower), letting go
// snaps them shut: the damage lands then, with a short hit-stop on both. A quick tap bites after the wind-up; a full hold
// bites harder. Enemies wind up too, and swimming away dodges them; being bitten cancels a bite still opening.
// Chunks of meat too big to swallow are bitten into smaller pieces.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (fn, ms, arg) => { for (let t = 0; t < ms; t += 100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const S = () => window.game.scene.getScene('Game');

await p.goto('http://localhost:4173/'); await G(() => localStorage.clear()); await p.reload();
await waitFor(() => document.getElementById('home')?.classList.contains('open'), 60000);
// Perk choices pause the game: pick the first one at once.
await G(() => window.addEventListener('ce:perk', () => setTimeout(() => document.querySelector('[data-perk]')?.click(), 30)));
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.menuMode && !!g.player; }, 30000);
await G(() => { window.game.scene.getScene('Game').player.setLevel(8); });
await waitFor(() => !document.querySelector('[data-perk]'), 20000);

// A reef fish too big to swallow, held in front of the mouth (stunned, lots of health so it never dies).
const place = () => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  pl.hp = pl.maxHp; pl.invulnTimer = 0; pl.arcadeBody.setVelocity(0, 0);
  let c = window.__t;
  if (!c) {
    c = g.creatures.find((c) => c.brain && !c.away && !c.asleep && !c.fish.species.friendly && !c.guardian && !c.boss && !pl.canSwallow(c.fish.size) && c.fish.size < pl.size * 2.5);
    if (!c) return null;
    window.__t = c;
    c.fish.maxHp *= 20;
  }
  c.fish.hp = c.fish.maxHp;
  const m = pl.mouthPoint();
  c.fish.setPosition(m.x + c.fish.size * 0.5, m.y);
  c.fish.arcadeBody.setVelocity(0, 0);
  c.fish.stun(30);
  return { hp: c.fish.hp, id: c.fish.species.id };
};
const keep = () => G(() => { const g = window.game.scene.getScene('Game'), c = window.__t.fish, m = g.player.mouthPoint(); c.setPosition(m.x + c.size * 0.5, m.y); c.arcadeBody.setVelocity(0, 0); });
const t0 = await G(place);
ok(!!t0, 'found a fish to bite: ' + t0?.id);

// Press and hold: the jaws open, then stay open; no damage while holding.
await G(() => { const g = window.game.scene.getScene('Game'); g.player.biteCooldown = 0; g.controller.uiSwallow = true; });
ok(await waitFor(() => window.game.scene.getScene('Game').pendingBites.get(window.game.scene.getScene('Game').playerCreature)?.phase === 'hold', 15000), 'holding EAT keeps the jaws open');
await keep();
const held = await G(() => { const g = window.game.scene.getScene('Game'); return { hp: window.__t.fish.hp, look: g.player.jawPhase, slow: g.player.jawSpeed }; });
ok(held.hp === t0.hp && held.look === 'hold' && held.slow < 1, `no damage while the jaws are open, and swimming is slower (x${held.slow})`);
// Hold long enough for a full charge, then let go.
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.pendingBites.get(g.playerCreature)?.holdT > 0.95; }, 20000);
await keep();
await G(() => { window.game.scene.getScene('Game').controller.uiSwallow = false; });
ok(await waitFor((hp) => window.__t.fish.hp < hp, 10000, t0.hp), 'letting go snaps the jaws shut: the damage lands');
const hit = await G(() => { const g = window.game.scene.getScene('Game'); return { frozen: g.player.frozen || window.__t.fish.frozen, phase: g.pendingBites.get(g.playerCreature)?.phase, look: g.player.jawPhase, dmg: window.__t.fish.maxHp - window.__t.fish.hp, bite: g.player.biteDamage * (1 - (window.__t.fish.species.armor ?? 0)) }; });
ok(hit.phase === 'recover' && hit.look === 'snap', 'then the recovery plays (jaws snapping shut)');
ok(hit.dmg > hit.bite * 1.15, `a full hold bites harder (${Math.round(hit.dmg)} vs ${Math.round(hit.bite)})`);
ok(await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.pendingBites.has(g.playerCreature); }, 10000), 'the bite ends');

// A quick tap: the bite still lands, right after the short wind-up.
await G(place);
await G(() => { const g = window.game.scene.getScene('Game'); g.player.biteCooldown = 0; g.controller.uiSwallow = true; });
await p.waitForTimeout(30);
await G(() => { window.game.scene.getScene('Game').controller.uiSwallow = false; });
const tap0 = await G(() => window.__t.fish.hp);
ok(await waitFor((hp) => window.__t.fish.hp < hp, 10000, tap0), 'a quick tap bites after the wind-up');
const frozeTap = await G(() => window.__t.fish.frozen || window.game.scene.getScene('Game').player.frozen);
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.pendingBites.has(g.playerCreature); }, 10000);

// Hit-stop: catch it by checking right at the landing of a bite started from code.
await G(place);
const stop = await G(() => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), c = window.__t.fish, hp = c.hp;
  g.player.biteCooldown = 0;
  g.startBite(g.playerCreature, window.__t);
  const tick = () => { if (c.hp < hp) res({ target: c.frozen, biter: g.player.frozen }); else requestAnimationFrame(tick); };
  tick();
  setTimeout(() => res(null), 20000);
}));
ok(frozeTap || (stop && stop.target && stop.biter), 'the impact freezes the biter and the target for a moment (hit-stop): ' + JSON.stringify(stop));
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.pendingBites.has(g.playerCreature); }, 10000);

// An enemy bite: the wind-up shows, and swimming away dodges it.
const dodge = await G(() => {
  const g = window.game.scene.getScene('Game'), pl = g.player, c = window.__t;
  c.fish.stunTimer = 0; pl.hp = pl.maxHp; pl.invulnTimer = 0; c.fish.biteCooldown = 0;
  g.startBite(c, g.playerCreature);
  const look = c.fish.jawPhase;
  pl.setPosition(pl.x + 3000, pl.y);
  return { hp: pl.hp, look };
});
ok(dodge.look === 'open', 'an enemy bite starts with its jaws opening (the wind-up you can see)');
ok(await waitFor(() => !window.game.scene.getScene('Game').pendingBites.has(window.__t) || window.game.scene.getScene('Game').pendingBites.get(window.__t).phase === 'recover', 15000), 'the enemy bite finishes');
ok(await G(() => window.game.scene.getScene('Game').player.hp) === dodge.hp, 'swimming away dodges it');

// Being bitten while your jaws are still opening cancels your bite.
await G(place);
await waitFor(() => !window.game.scene.getScene('Game').pendingBites.has(window.__t), 10000);
const cancel = await G(() => {
  const g = window.game.scene.getScene('Game'), c = window.__t;
  c.fish.stunTimer = 0; c.fish.biteCooldown = 0;
  g.startBite(c, g.playerCreature);
  const had = g.pendingBites.has(c);
  g.player.biteCooldown = 0; g.player.invulnTimer = 0;
  g.bite(g.playerCreature, c);
  return { had, after: g.pendingBites.has(c), look: c.fish.jawPhase };
});
ok(cancel.had && !cancel.after && cancel.look === null, 'getting bitten during the wind-up cancels the bite');

// Big meat: a chunk too big to swallow is bitten into smaller pieces.
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.pendingBites.has(g.playerCreature); }, 10000);
const meat = await G(() => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  window.__t.fish.setPosition(pl.x - 2000, pl.y);
  const m = pl.mouthPoint();
  const big = pl.devourSize * 3;
  const f = g.food.spawnMeat(m.x, m.y, big, 90, false);
  f.driftX = 0;
  window.__chunk = f;
  // Record the pieces (the hero eats the ones it can swallow on contact, so they may be gone at once).
  window.__pieces = [];
  const spawn = g.food.spawnMeat.bind(g.food);
  g.food.spawnMeat = (x, y, size, xp, scrap) => { window.__pieces.push(size); return spawn(x, y, size, xp, scrap); };
  return { big, before: g.food.items.filter((x) => x.kind === 'meat').length };
});
await G(() => { const g = window.game.scene.getScene('Game'); g.player.biteCooldown = 0; g.controller.uiSwallow = true; });
await p.waitForTimeout(30);
await G(() => { window.game.scene.getScene('Game').controller.uiSwallow = false; });
ok(await waitFor(() => !window.__chunk.alive, 10000), 'biting a chunk too big to swallow breaks it');
const pieces = await G((big) => { const g = window.game.scene.getScene('Game'); const m = window.__pieces; return { n: m.length, sizes: m.map((x) => Math.round(x)), canSwallow: m.every((x) => x < big * 0.75 && g.player.canSwallow(x)) }; }, meat.big);
ok(pieces.n >= 2 && pieces.canSwallow, `into smaller pieces the hero can swallow (${pieces.sizes.join(', ')})`);

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
