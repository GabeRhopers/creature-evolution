// Delayed bites (Rhopers, Nov 26): a bite plays its animation first and the damage lands when the jaws shut,
// combat.biteDelaySeconds later, for the player and for every creature. A target that gets away in time is missed.
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
// Perk choices pause the game: pick the first one at once.
await G(() => window.addEventListener('ce:perk', () => setTimeout(() => document.querySelector('[data-perk]')?.click(), 30)));
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.menuMode && !!g.player; }, 30000);


// Put a reef fish right in front of the player's mouth and hold both still.
const setup = () => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  pl.setLevel(8); pl.hp = pl.maxHp; pl.invulnTimer = 0;
  const c = g.creatures.find((c) => c.brain && !c.away && !c.asleep && !c.fish.species.friendly && c.fish.size > pl.size * 0.9 && !c.guardian && !c.boss) ?? g.creatures.find((c) => c.brain && !c.away && !c.fish.species.friendly && !c.guardian);
  window.__t = c;
  const m = pl.mouthPoint();
  c.fish.setPosition(m.x + c.fish.size * 0.6, m.y);
  c.fish.arcadeBody.setVelocity(0, 0); pl.arcadeBody.setVelocity(0, 0);
  c.fish.stun(5); c.fish.hp = c.fish.maxHp * 10; c.fish.maxHp *= 10;
  return { hp: c.fish.hp, id: c.fish.species.id };
};
const s = await G(setup);
const start = await G(() => { const g = window.game.scene.getScene('Game'); g.startBite(g.playerCreature, window.__t); return { hp: window.__t.fish.hp, pending: g.pendingBites.size, t0: g.time.now }; });
ok(start.hp === s.hp && start.pending === 1, `the bite starts: no damage yet (${s.id}), one bite under way`);
await G(() => { const c = window.__t.fish, m = window.game.scene.getScene('Game').player.mouthPoint(); c.setPosition(m.x + c.size * 0.6, m.y); });
ok(await waitFor(() => window.game.scene.getScene('Game').pendingBites.size === 0, 30000), 'the bite lands');
const landed = await G(() => window.__t.fish.hp);
ok(landed < s.hp, `the damage lands when the jaws shut (${Math.round(s.hp)} -> ${Math.round(landed)})`);

// A second bite while the target swims away: a miss.
await G(setup);
const hp2 = await G(() => { const g = window.game.scene.getScene('Game'); g.player.biteCooldown = 0; g.startBite(g.playerCreature, window.__t); window.__t.fish.setPosition(window.__t.fish.x + 2000, window.__t.fish.y); return window.__t.fish.hp; });
ok(await waitFor(() => window.game.scene.getScene('Game').pendingBites.size === 0, 30000), 'the second bite finishes');
ok(await G(() => window.__t.fish.hp) === hp2, 'a target that got away is missed');

// A creature biting the player: the player can dodge too.
const dodge = await G(() => {
  const g = window.game.scene.getScene('Game'), pl = g.player, c = window.__t;
  c.fish.stunTimer = 0; c.fish.stun?.(0);
  pl.hp = pl.maxHp; pl.invulnTimer = 0;
  c.fish.biteCooldown = 0;
  g.startBite(c, g.playerCreature);
  pl.setPosition(pl.x + 3000, pl.y);
  return pl.hp;
});
ok(await waitFor(() => window.game.scene.getScene('Game').pendingBites.size === 0, 30000), 'the enemy bite finishes');
ok(await G(() => window.game.scene.getScene('Game').player.hp) === dodge, 'swimming away dodges an enemy bite');

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
