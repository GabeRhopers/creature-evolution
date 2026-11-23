// Terrain in the running game: islands, seamounts and dunes are solid, roots hide you,
// nothing spawns inside rock, and the art is drawn.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });

ok(await G(() => { const g = window.game.scene.getScene('Game'); return ['w_ground_0', 'w_island_0', 'w_coral_brain_0'].every((k) => g.textures.exists(k)); }), 'ground, island and coral art are drawn');

// Nothing starts inside the terrain.
const inside = await G(() => {
  const g = window.game.scene.getScene('Game');
  const fish = g.creatures.filter((c) => g.terrain.isSolid(c.fish.x, c.fish.y, 0)).length;
  const food = g.food.items.filter((f) => g.terrain.isSolid(f.img.x, f.img.y, 0)).length;
  return { fish, food };
});
ok(inside.fish === 0, 'no fish spawned inside rock or sand: ' + inside.fish);
ok(inside.food === 0, 'no food spawned inside rock or sand: ' + inside.food);

// Drop the player inside an island's sandbank: it is pushed down into the water.
await G(() => { const g = window.game.scene.getScene('Game'); const isl = g.terrain.cfg.islands[0]; g.player.setPosition(isl.x, g.terrain.ceilAt(isl.x) - 15); });
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.terrain.isSolid(g.player.x, g.player.y, 0); }, undefined, 5000);
ok(await G(() => { const g = window.game.scene.getScene('Game'); return g.player.y > g.terrain.ceilAt(g.player.x); }), 'pushed out of the island sandbank');

// Under the island, in the mangrove roots: hidden.
const hidden = await G(() => { const g = window.game.scene.getScene('Game'); const [x, y, w, h] = g.terrain.rootZones()[0]; g.player.setPosition(x + w / 2, y + h * 0.7); g.player.body.velocity.set(0, 0); return new Promise((r) => setTimeout(() => r(g.playerHidden), 400)); });
ok(hidden, 'the mangrove roots hide you');

// Swim hard into a seamount wall from the side: it stops you (and you end up outside it).
await G(() => { const g = window.game.scene.getScene('Game'); const s = g.terrain.cfg.seamounts[0]; const y = g.terrain.groundAt(s.x) + 300; let x = s.x - s.width / 2; while (g.terrain.groundAt(x) > y) x += 4; g.player.setPosition(x - 200, y); g.__wallX = x; });
await p.keyboard.down('ArrowRight');
await p.waitForTimeout(2500);
await p.keyboard.up('ArrowRight');
const wall = await G(() => { const g = window.game.scene.getScene('Game'); return { x: g.player.x, wallX: g.__wallX, solid: g.terrain.isSolid(g.player.x, g.player.y, 0) }; });
ok(!wall.solid && wall.x < wall.wallX + 40, `the seamount wall stops you (x ${Math.round(wall.x)}, wall ${Math.round(wall.wallX)})`);

// After a while of play, no AI fish ends up inside the terrain.
await p.waitForTimeout(6000);
// A fish can be a few px inside for one frame before it is pushed out (slow machines catch that moment):
// only a fish that is still inside a moment later counts as stuck.
const stuckNow = () => G(() => { const g = window.game.scene.getScene('Game'); return g.creatures.filter((c) => !c.isPlayer && g.terrain.isSolid(c.fish.x, c.fish.y, 0)).map((c) => g.creatures.indexOf(c)); });
const first = await stuckNow();
await p.waitForTimeout(1500);
const later = await stuckNow();
const stuck = first.filter((i) => later.includes(i)).length;
ok(stuck === 0, 'no AI fish stays inside the terrain: ' + stuck + ' (passing through: ' + first.length + ')');

// Scenery: art, a solid arch you can swim through, a vent that heals, a wreck that hides you.
ok(await G(() => { const g = window.game.scene.getScene('Game'); return ['w_scn_galleon', 'w_scn_arch', 'w_scn_vent', 'w_far_peaks', 'w_far_islands', 'w_float_rowboat'].every((k) => g.textures.exists(k)); }), 'scenery and far layers are drawn');
const arch = await G(() => {
  const g = window.game.scene.getScene('Game');
  const pc = { x: 3930 };
  // Arch rock circles live in the rocks group next to it.
  const circles = g.rocks.getChildren().filter((z) => Math.abs(z.x - pc.x) < 200);
  const top = Math.min(...circles.map((z) => z.y));
  const legY = Math.max(...circles.map((z) => z.y));
  return { n: circles.length, top, legY };
});
ok(arch.n >= 10, 'the arch is solid rock (' + arch.n + ' rock circles)');
// A small fish fits through the opening: the middle at leg height is free of rock circles.
ok(await G(() => { const g = window.game.scene.getScene('Game'); return !g.rocks.getChildren().some((z) => Math.abs(z.x - 3930) < 40 && z.y > g.terrain.groundAt(3930) - 160); }), 'the arch opening is free to swim through');
// Vent: hurt the player, park it by a vent, it heals.
const healed = await G(async () => {
  const g = window.game.scene.getScene('Game');
  const v = g.vents[0];
  g.player.hp = g.player.maxHp * 0.5;
  const before = g.player.hp;
  g.creatures.forEach((c) => { if (c.brain) c.fish.setPosition(c.fish.x, 200); });
  for (let i = 0; i < 20; i++) { g.player.setPosition(v.x, v.y - 60); g.player.body.velocity.set(0, 0); await new Promise((r) => setTimeout(r, 100)); }
  return { inVent: g.inVent, before, after: g.player.hp, status: window.game.scene.getScene('Hud').status.text };
});
ok(healed.inVent && healed.after > healed.before, `a warm vent heals (${healed.before.toFixed(1)} -> ${healed.after.toFixed(1)})`);
ok(await G(async () => { const g = window.game.scene.getScene('Game'); for (let i = 0; i < 10; i++) { g.player.setPosition(4700, g.terrain.groundAt(4700) - 80); g.player.body.velocity.set(0, 0); await new Promise((r) => setTimeout(r, 100)); } return g.playerHidden; }), 'the galleon hides you');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
