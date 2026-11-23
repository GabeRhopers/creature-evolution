// The bigger looping world: three regions, a seamless loop at the edge, fish kept near the player,
// region banners, and copied scenery past each edge.
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
await G(() => { const h = window.game.scene.getScene('Hud'); window.__banners = []; const f = h.areaBanner.bind(h); h.areaBanner = (n) => { window.__banners.push(n); f(n); }; });

const W = await G(() => window.game.scene.getScene('Game').regions.width);
ok(W === 72000, 'the world is 72000 px wide (each region doubled twice): ' + W);
ok(await G(() => { const g = window.game.scene.getScene('Game'); return g.regions.at(4500).id === 'coral' && g.regions.at(30000).id === 'swamp' && g.regions.at(47000).id === 'volcano' && g.regions.at(64000).id === 'ice'; }), 'Coral Sea, Mangrove Swamp, Volcanic Rift and Frozen Sea, left to right');
ok(await G(() => window.game.scene.getScene('Game').player.x === 4500), 'a new run starts in the Coral Sea');
ok(await G(() => { const g = window.game.scene.getScene('Game'); return ['w_water_coral', 'w_water_swamp', 'w_water_volcano', 'w_water_ice'].every((k) => g.textures.exists(k)); }), 'each region has its own water');
const copies = await G((W) => window.game.scene.getScene('Game').children.list.filter((o) => o.x > W + 50 && o.texture && o.texture.key && o.texture.key.startsWith('w_')).length, W);
ok(copies > 20, `scenery near the edges is copied past them (${copies} copies)`);

// Gates are tested in gates.mjs; here the whole sea is open.
await G(() => window.game.scene.getScene('Game').gates.openAll());

// Swim right across the seam (Frozen Sea -> Coral Sea).
await G((W) => { const g = window.game.scene.getScene('Game'); g.player.setPosition(W - 250, 400); g.player.body.velocity.set(0, 0); g.cameras.main.centerOn(W - 250, 400); }, W);
await p.waitForTimeout(400);
await p.keyboard.down('ArrowRight');
const looped = await waitFor(() => { const g = window.game.scene.getScene('Game'); return g.player.x < 2000 && g.player.x > 0; }, undefined, 40000);
await p.keyboard.up('ArrowRight');
ok(looped, 'swimming past the right edge brings you into the Coral Sea from the left');
const view = await G(() => { const g = window.game.scene.getScene('Game'); const v = g.cameras.main.worldView; return { px: g.player.x, cx: v.centerX, w: v.width }; });
ok(Math.abs(view.px - view.cx) < view.w / 2, 'the camera stays on the player through the loop');
ok(await G((W) => { const g = window.game.scene.getScene('Game'); return g.creatures.every((c) => Math.abs(c.fish.x - g.player.x) <= W / 2 + 400); }, W), 'every fish stays within half a world of the player (give or take one frame of swimming)');
ok(await waitFor(() => window.__banners.includes('Coral Sea'), undefined, 8000), 'a banner names the region you enter');

// Swim left back across the seam.
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(150, 400); g.player.body.velocity.set(0, 0); });
await p.keyboard.down('ArrowLeft');
const back = await waitFor((W) => window.game.scene.getScene('Game').player.x > W - 2000, W, 40000);
await p.keyboard.up('ArrowLeft');
ok(back, 'and past the left edge into the Frozen Sea');
ok(await waitFor(() => window.__banners.includes('Frozen Sea'), undefined, 8000), 'the Frozen Sea banner shows');

// The Volcanic Rift: banner, volcano islands, glowing vents.
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(41500, 600); g.player.body.velocity.set(0, 0); g.cameras.main.centerOn(41500, 600); });
ok(await waitFor(() => window.__banners.includes('Volcanic Rift'), undefined, 10000), 'the Volcanic Rift banner shows');
ok(await G(() => { const g = window.game.scene.getScene('Game'); return g.terrain.cfg.islands.some((i) => i.style === 'volcano' && g.textures.exists('w_island_' + g.terrain.cfg.islands.indexOf(i))); }), 'volcano islands are drawn');
await G(() => { const g = window.game.scene.getScene('Game'); g.player.setPosition(41100, g.seabedTop - 200); g.cameras.main.centerOn(41100, g.seabedTop - 200); });
ok(await waitFor(() => window.game.scene.getScene('Light').glows.some((d) => d.visible && d.tintTopLeft === 0xf77622), undefined, 8000), 'hot vents glow');

// Terrain repeats around the loop.
ok(await G((W) => { const t = window.game.scene.getScene('Game').terrain; return [100, 5000, 12000, 30000, 47000, 66000].every((x) => Math.abs(t.groundAt(x) - t.groundAt(x + W)) < 0.01 && Math.abs(t.groundAt(x) - t.groundAt(x - W)) < 0.01); }, W), 'the ground repeats every world width');

ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
await b.close();
