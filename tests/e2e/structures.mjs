// Mid-water structures (Nov 27): rock outcrops are solid all round, shelves are one-way (swim up through them, rest on
// top). Both are drawn where the terrain says they are.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.setDefaultNavigationTimeout(90000); p.setDefaultTimeout(60000);
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const G = (f, a) => p.evaluate(f, a);
const waitFor = async (fn, ms, arg) => { for (let t = 0; t < ms; t += 100) { if (await G(fn, arg)) return true; await p.waitForTimeout(100); } return G(fn, arg); };
const shots = process.env.SHOTS;

await p.goto('http://localhost:4173/'); await G(() => localStorage.clear()); await p.reload();
await waitFor(() => document.getElementById('home')?.classList.contains('open'), 60000);
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.menuMode && !!g.player; }, 30000);

// Any depth for this test, nobody else around.
const info = await G(() => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  g.gates.openAll();
  const st = pl.stage;
  Object.defineProperty(pl, 'stage', { get: () => (st ? { ...st, maxDepth: 1 } : st), configurable: true });
  const s = g.terrain.structures;
  return {
    n: s.length,
    drawn: g.children.list.filter((o) => o.name === 'structure').length,
    shelf: s.find((x) => x.kind === 'shelf'),
    rock: s.find((x) => x.kind === 'rock'),
    r: pl.arcadeBody.halfWidth,
  };
});
ok(info.n >= 14 && info.drawn === info.n, `structures are placed and drawn (${info.drawn} of ${info.n})`);
const clearAround = (x) => G((x) => {
  const g = window.game.scene.getScene('Game');
  g.creatures.forEach((c) => { if (c.brain) c.fish.setPosition(x + 9000, c.fish.y); });
}, x);

// 1. Coming down onto a shelf: it holds you.
const { shelf: s, rock: k, r } = info;
console.log(`player radius ${r}`);
await clearAround(s.x);
await G(({ s, r }) => { const g = window.game.scene.getScene('Game'), pl = g.player; pl.setPosition(s.x, s.y - r - 90); pl.arcadeBody.setVelocity(0, 0); }, { s, r });
await p.waitForTimeout(300);
await p.keyboard.down('ArrowDown');
const down = await G(({ s }) => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  // Sample after each game update (after the terrain push-out), not between frames.
  let maxBottom = -Infinity, n = 0;
  const tick = () => {
    maxBottom = Math.max(maxBottom, pl.y + pl.arcadeBody.halfWidth);
    if (n++ > 90) { g.events.off('postupdate', tick); res({ maxBottom, y: pl.y }); }
  };
  g.events.on('postupdate', tick);
}), { s });
await p.keyboard.up('ArrowDown');
ok(down.maxBottom > s.y - 20 && down.maxBottom <= s.y + 12, `swimming down onto a shelf stops on its top (lowest ${Math.round(down.maxBottom)}, shelf ${Math.round(s.y)})`);
if (shots) await p.screenshot({ path: `${shots}/shelf.png` });

// 2. From below you swim straight up through it.
await G(({ s, r }) => { const g = window.game.scene.getScene('Game'), pl = g.player; pl.setPosition(s.x, s.y + r + 120); pl.arcadeBody.setVelocity(0, 0); }, { s, r });
await p.keyboard.down('ArrowUp');
const upOk = await waitFor((s) => { const pl = window.game.scene.getScene('Game').player; return pl.y + pl.arcadeBody.halfWidth < s.y - 4; }, 20000, s);
await p.keyboard.up('ArrowUp');
ok(upOk, 'from below you swim up through a shelf');

// 3. A rock is solid from the side: swimming into it never goes inside.
await clearAround(k.x);
await G(({ k, r }) => { const g = window.game.scene.getScene('Game'), pl = g.player; pl.setPosition(k.x - k.rx - r - 120, k.y); pl.arcadeBody.setVelocity(0, 0); }, { k, r });
await p.waitForTimeout(300);
await p.keyboard.down('ArrowRight');
const into = await G(({ k }) => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  // Sample after each game update. Swimming into the rounded side you slide around it (over or under),
  // but never into it: when you are level with its middle you are above or below it.
  let inside = 0, overlap = 0, n = 0;
  const tick = () => {
    // A frame's movement may show before the push-out (as with all terrain), so look for real overlap:
    // the center inside the rock's inner 70%.
    if (Math.hypot((pl.x - k.x) / k.rx, (pl.y - k.y) / k.ry) < 0.7) inside++;
    if (Math.abs(pl.x - k.x) < k.rx * 0.5 && Math.abs(pl.y - k.y) < k.ry) overlap++;
    if (n++ > 150) { g.events.off('postupdate', tick); res({ inside, overlap, x: pl.x }); }
  };
  g.events.on('postupdate', tick);
}), { k });
await p.keyboard.up('ArrowRight');
ok(into.inside === 0 && into.overlap === 0, `a rock outcrop is solid: you slide around it, never through it (frames inside ${into.inside}, through the middle ${into.overlap})`);
if (shots) {
  await G(({ k, r }) => { const pl = window.game.scene.getScene('Game').player; pl.setPosition(k.x - k.rx - r - 60, k.y - 40); pl.arcadeBody.setVelocity(0, 0); window.game.scene.getScene('Game').cameras.main.centerOn(pl.x, pl.y); }, { k, r });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${shots}/rock.png` });
}

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
