// Islands rebuilt (Nov 27): the land you stand on is exactly the land that is drawn (every style, mangroves included), and
// islands are solid from the side while in the air: a leap at an iceberg stops against it instead of flying through the peak.
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
await p.click('#btnPlay');
await waitFor(() => { const g = window.game.scene.getScene('Game'); return !g.menuMode && !!g.player && !!g.islandLand; }, 30000);
await G(() => { const g = window.game.scene.getScene('Game'); g.gates.openAll(); g.creatures.forEach((c) => { if (c.brain) c.fish.setPosition(c.fish.x, 2600); }); });

// 1. The drawn top of every island is where its land is: the top solid row is painted in every land column, for every style.
const drawn = await G(() => {
  const g = window.game.scene.getScene('Game');
  const out = {};
  for (const pr of g.islandLand.profiles) {
    if (out[pr.style] && out[pr.style].checked > 200) continue;
    const key = `w_island_${pr.index}`;
    const o = out[pr.style] ?? (out[pr.style] = { checked: 0, missing: 0 });
    for (let c = 0; c < pr.cols; c++) {
      const h = pr.land[c];
      if (h <= 0) continue;
      const px = g.textures.getPixel(c, pr.aboveRows - h, key);
      o.checked++;
      if (!px || px.alpha < 200) o.missing++;
    }
  }
  return out;
});
for (const style of ['sand', 'mangrove', 'iceberg', 'volcano', 'cave'])
  ok(drawn[style] && drawn[style].checked > 0 && drawn[style].missing === 0, `${style}: the top you stand on is drawn in every column (${JSON.stringify(drawn[style])})`);

// 2. Leap onto a mangrove: you land on its mud bank, exactly on the drawn top.
const mang = await G(() => {
  const g = window.game.scene.getScene('Game'), pl = g.player, pr = g.islandLand.profiles.find((x) => x.style === 'mangrove');
  pl.setPosition(pr.x - (pr.cols * 4) * 0.25, g.terrain.surfaceY - 60);
  g.landState = 'air';
  pl.arcadeBody.setVelocity(60, 0);
  return { x: pr.x };
});
ok(await waitFor(() => window.game.scene.getScene('Game').landState !== 'air', 20000), 'the leap comes down');
const stand = await G(() => { const g = window.game.scene.getScene('Game'), pl = g.player, top = g.landTopAt(pl.x); return { st: g.landState, feet: pl.y + pl.arcadeBody.halfHeight * 0.85, top }; });
ok(stand.st === 'land' && stand.top !== null && Math.abs(stand.feet - stand.top) < 1.5, `on a mangrove you stand on the mud bank, on the drawn top (${JSON.stringify(stand)})`);
// Walk off: back in the water.
await G(() => { const g = window.game.scene.getScene('Game'); g.dryTime = 0; });
await p.keyboard.down('ArrowRight');
ok(await waitFor(() => window.game.scene.getScene('Game').landState === 'water', 40000), 'walking off the bank splashes back in');
await p.keyboard.up('ArrowRight');

// 3. An iceberg is a wall from the side: a leap into its peak stops against it (never past the middle below the top).
const ice = await G(() => {
  const g = window.game.scene.getScene('Game'), pr = g.islandLand.profiles.find((x) => x.style === 'iceberg');
  const peakTop = g.landTopAt(pr.x);
  return { x: pr.x, left: pr.left, peakTop, surface: g.terrain.surfaceY };
});
const through = await G((ice) => new Promise((res) => {
  const g = window.game.scene.getScene('Game'), pl = g.player;
  // In the air to the left of the iceberg, level with the middle of its height, flying right fast.
  pl.setPosition(ice.left - 30, (ice.peakTop + ice.surface) / 2 - 10);
  g.landState = 'air';
  pl.arcadeBody.setVelocity(700, -60);
  let maxX = -Infinity, n = 0;
  const tick = () => {
    if (g.landState === 'air' && pl.y < ice.peakTop + 4) maxX = Math.max(maxX, pl.x);
    if (g.landState === 'air' && pl.y >= ice.peakTop + 4) maxX = Math.max(maxX, pl.x);
    if (g.landState !== 'air' || n++ > 240) res({ maxX, end: g.landState, x: pl.x }); else requestAnimationFrame(tick);
  };
  tick();
}), ice);
ok(through.maxX < ice.x, `a leap into an iceberg stops against its side (got to x ${Math.round(through.maxX)}, peak at ${Math.round(ice.x)})`);

ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
await b.close();
