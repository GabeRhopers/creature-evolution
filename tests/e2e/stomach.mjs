// Stomach: bite scraps (from a fish still alive) give a little XP but no food; real meals fill it;
// digesting empties it almost completely.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000); // slow CI runners
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (f, a, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await G(f, a).catch(() => false)) return true; await p.waitForTimeout(150); } return false; };

await p.goto('http://localhost:4173/');
await G(() => localStorage.clear());
await p.reload();
await waitFor(() => window.game?.scene.getScene('Game')?.player);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player && !g.menuMode; });
// Calm water: move every other fish far away.
await G(() => { const g = window.game.scene.getScene('Game'); g.creatures.forEach((c) => { if (c.brain) c.fish.setPosition(c.fish.x < 4500 ? 300 : 8700, 2500); }); });

const feed = (scrap) => G(async (scrap) => {
  const g = window.game.scene.getScene('Game');
  const pl = g.player;
  g.stomach.fill = g.stomach.capacity * 0.3;
  const before = { fill: g.stomach.fill, xp: pl.xp + g.stomach.bank };
  const m = pl.mouthPoint(false);
  // Only the meat this test drops counts (fights elsewhere in the sea may leave meat too).
  const old = new Set(g.food.items);
  g.food.spawnMeat(m.x, m.y, 2, 20, scrap);
  const mine = () => g.food.items.filter((f) => f.kind === 'meat' && !old.has(f));
  for (let i = 0; i < 200; i++) { const q = pl.mouthPoint(false); mine().forEach((f) => f.img.setPosition(q.x, q.y)); await new Promise((r) => setTimeout(r, 100)); if (!mine().length) break; }
  return { eaten: !mine().length, fillGain: g.stomach.fill - before.fill, xpGain: pl.xp + g.stomach.bank - before.xp };
}, scrap);

const s1 = await feed(true);
ok(s1.eaten && s1.fillGain <= 0.5, `bite scraps do not fill the stomach (fill +${s1.fillGain.toFixed(2)})`);
ok(s1.xpGain > 0, 'bite scraps still give a little XP');
const s2 = await feed(false);
ok(s2.eaten && s2.fillGain > 10, `a real meal fills the stomach (fill +${s2.fillGain.toFixed(1)})`);

// Digest: fill to 90%, stay still, the stomach drops to about 15%.
await G(() => { const g = window.game.scene.getScene('Game'); g.stomach.fill = g.stomach.capacity * 0.9; });
ok(await waitFor(() => { const g = window.game.scene.getScene('Game'); g.player.body.velocity.set(0, 0); return g.stomach.digesting || g.stomach.ratio < 0.2; }, undefined, 45000), 'resting digests');
const ratio = await G(() => window.game.scene.getScene('Game').stomach.ratio);
ok(ratio < 0.2, `digesting empties the stomach almost completely (${Math.round(ratio * 100)}%)`);
ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
