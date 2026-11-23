# Architecture review (Nov 22, 2026)

A review of Creature Evolution for stability and efficiency, after the sea grew to 36000 px with
four regions and about 470 creatures. Numbers below come from headless Chrome on the CI machine
(software rendering, so only the CPU side is meaningful). An iPad's CPU is roughly 2 to 3 times
slower, so every millisecond here is 2 to 3 ms there, against a 16.7 ms budget for 60 fps.

## How the game is put together

| Layer | Where | Notes |
| --- | --- | --- |
| Data | `src/data/*.json` + `index.ts` | All tuning numbers; admin settings patch them at startup. Good: no magic numbers. |
| Pure systems | `src/systems/` (growth, stomach, terrain, regions, dayNight, spatialGrid) | Unit tested, no Phaser. The healthiest part of the code. |
| Entities and AI | `Fish.ts`, `Brain.ts` | One class for every swimmer; one state machine per AI fish. |
| Scenes | `GameScene` (2300+ lines), `HudScene`, `LightScene`, `BootScene` | Game does world building, spawning, combat, land, crab, loop, saves. |
| UI | `src/ui/menu.ts` (1100 lines) + `index.html` | DOM overlays. |
| Tests | 280+ unit tests (Vitest), 26 browser suites (Playwright) | Run on every PR; auto-merge only when green. |

## What was measured

Per frame, at level 35 with 471 creatures (before -> after this review):

| Cost | Before | After |
| --- | --- | --- |
| Brains (each fish looking for prey, threats, school mates) | 3.5 ms | 1.3 ms |
| Whole frame on the CPU (update + draw preparation) | 7.1 ms | 5.4 ms |
| Drawing preparation | 2.5 ms | 2.0 ms |

No leaks: six restarts in a row keep the same texture count (160), memory (47 MB), scene objects
and tweens. Hud and Light scenes are launched once, so their listeners do not pile up.

## Findings and what was done

1. **Every fish checked every other fish, every frame** (cost grows with the square of the count:
   470 fish = about 220,000 checks). Now a spatial grid (`src/systems/spatialGrid.ts`, cells of
   `ai.gridCell` px) is rebuilt each frame and brains only look at the cells their vision covers.
   Same answers (unit test compares it with checking everything), 2.7x cheaper.
2. **Phaser draws every sprite, even far off screen.** Fish more than half a screen outside the view
   are now hidden (they still swim, hunt and eat) and skip their animation work. Brains no longer use
   `visible` to mean "exists": only a hidden player is skipped.
3. **About 550 kelp sway tweens ran all the time**, even for kelp far away. Culled kelp now pauses its
   tween and resumes when it comes back into view.
4. **One error in any system froze the whole game** (Phaser stops the loop). The game loop and the
   light overlay now catch errors, log each one once (`ce:error` event, `GameScene.frameErrors`) and
   keep running. Saves were already safe (each slot keeps a backup copy).
5. **The browser test job outgrew its 25 minute limit** (a PR's run was cancelled). The 26 suites now
   run in three parallel shards; a final `browser` job keeps the same check name for auto-merge.
6. **Slow CI machines caused flaky tests** (fixed waits). Suites now poll with `waitFor` and hold
   buttons until the game reacts (pad_map, shark, tides fixes today).

## Recommended next steps (not done yet, in order of value)

1. **Split GameScene** (2300 lines) into helpers it owns: `WorldBuilder` (water, ground, islands,
   scenery, rocks, kelp, loop copies), `Population` (spawning, respawn, unlocks, homes), `Combat`
   (bite, kill, rams, eating), `LandSystem` (leap, land, drying), `CrabSystem`. Each one gets its own
   file and tests. Do it one piece per PR, with the full browser suite as the safety net.
2. **Pool AI fish instead of re-creating them**: respawn already reuses fish; unlock waves could also
   reuse hidden ones.
3. **Build the world textures lazily per region** (ground chunks and islands near the player first),
   to shorten the start on iPads.
4. **Measure on the iPad itself**: add a `?perf=1` overlay (fps, frame ms, creatures drawn) so the
   numbers come from the real device.
5. **Menu code** (`menu.ts`, 1100 lines): split per panel (saves, options, enemy settings, controller).
6. **One source for the world layout**: features are placed by hand in `balance.json`; a small checker
   test already catches overlaps of islands, seamounts and scenery on slopes; keep it growing with the map.
