# CLAUDE.md: rules for AI coding sessions on this repo

Creature Evolution, a 2D side-view underwater survival and growth game, inspired by the
mechanics of Feed and Grow: Fish. Browser game: **Phaser 4.2 + TypeScript + Vite**.
Owner tests mostly on an **iPad** (touch) and a laptop (keyboard/mouse).

## Commands
- `npm install` once, then `npm run dev` (local server, `--host` for LAN/iPad)
- `npm run build` = atlas + typecheck + production build into `dist/`
- `npm run atlas` = rebuild `public/assets/atlas.{png,json}` from `art/`
- `npm run typecheck`

## Architecture
- `src/data/*.json`: ALL tuning numbers (species, balance, difficulty). No magic
  numbers in logic; read them through `src/data/index.ts`.
- `src/systems/growth.ts`: pure growth formulas (size, HP, bite, XP, devour size).
- `src/entities/Fish.ts`: one class for every swimmer (player and AI). Movement =
  heading + limited turn rate + thrust + drag + soft speed cap + stamina sprint.
- Controllers produce a `SwimIntent` (`PlayerController` for input, `src/ai/Brain.ts` for AI).
- `Brain` = per-fish state machine; GameScene implements `AIWorld` (creature list,
  food, kelp hiding, difficulty) and resolves who eats whom (`updateAiEating`).
- Threat rule: X threatens Y if X can swallow Y, or X is an aggressive biter and
  >= 1.25x Y's size (`Brain.isThreat`). Combat lives in GameScene `bite/kill/updateRams`.
  Never move a fish directly; give it an intent.
- `src/scenes/`: Boot (loads atlas), Game (world + entities), Light (time-of-day overlay), Hud (screen overlay).
- Performance and stability (see `docs/ARCHITECTURE.md`): brains find nearby creatures through a spatial grid
  rebuilt each frame (`src/systems/spatialGrid.ts`, `AIWorld.nearby`, `ai.gridCell`); never loop over all creatures
  inside a brain. AI fish more than half a screen outside the view are not drawn (`visible` = drawn, not "exists":
  brains only skip a hidden player) and skip their look updates; culled kelp pauses its sway tween. The game loop
  (`GameScene.update` -> `step`) and the light overlay catch errors, log each once (`ce:error`, `frameErrors`, and the
  device's problem log via `noteError`) and keep running. `main.ts` also wraps `Phaser.Game.prototype.step`: Phaser asks
  for the next frame only after the current one finishes, so any other uncaught error (HUD, rendering) used to freeze the
  game for good; now it is reported (`reportError` -> the "Something went wrong" panel, which shows the message) and the
  frames keep coming. Options > Problem log lists the device's logged errors (`ce.errors`) so iPad reports can be screenshotted.
  `GameScene.guardPlayer` puts a hero with a broken position, or stuck in the air over `land.maxAirSeconds`, back in the water. CI runs the browser suites in three parallel shards (`browser-shard`); a new e2e suite must be
  added to one shard's list in `.github/workflows/test.yml`.
- `src/entities/Food.ts`: plankton field kept around the camera (pooled images).
- Eating lives in `GameScene.updateEating()`: mouth = circle ahead of the head
  (`Fish.mouthPoint/mouthRadius`); swallow allowed if `target.size <= devourSize`.
- `src/systems/Stomach.ts`: pure stomach/digestion logic; GameScene applies releases (heal first, then XP).
  Capacity grows at least `capacityStepMin` (15%) per level up to `capacityStepMaxLevels` (`stomachCapacityAt`);
  digesting drops it to `digestTo` (15%). Meat torn off a fish that is still alive is a `scrap`: it gives
  `biteScrapXpFraction` of its XP and does not fill the stomach (it can be eaten even when full); carcass meat fills.
- `src/audio/Sfx.ts`: all sound effects synthesized with Web Audio (no files). Music: `public/assets/audio/`.
  Soundtrack (`src/audio/Music.ts`, `balance.json` "music"): moods = the recorded CC0 track (Sunny Reef) plus
  generated pieces (Golden Hour, Moonlit Reef, Mangrove Mist, Ice Shelf, Into the Deep, Crab Showdown: scale, key,
  bpm, melody/bass/pad/ticks). `GameScene.updateMood` picks one each second (crab nearby > Deep > region > time
  of day) and calls `HudScene.setMood`; moods cross-fade; each Tide shifts the key; being hunted adds a low pulse.
  SFX added: region chime, dawn/dusk chime, crab horn, new-enemy sting, splash.
- `src/ui/menu.ts` + overlays in `index.html`: home screen (game runs in attract mode behind it,
  `GameScene.menuMode`), how to play, options, credits, pause menu, best record (localStorage).
  Scene API: `startPlay(difficulty)`, `restartRun()`, `goHome()`; events `ce:pause`, `ce:home`, `ce:run`.
- Developer buttons (TUNE, GROW) only appear with `?dev=1`.
- `src/ui/tuning.ts`: live slider panel (` key or TUNE button) for feel tuning.

## Player character
The player is a **crocodile designed by the owner's son** (pixel art). Frames are drawn as
text grids in `scripts/croc-frames.py` (48x16, 3x upscale) -> `art/player/` -> atlas.
Keep his design (eye bumps, tooth row, back scutes, curled tail tip); only polish it.
Species can declare `art` in species.json (radius, mouth reach, animation frames).

**Mosa** is the second playable hero, also designed by the son (`tools/mosa/`: his drawings,
the sampled grids and `draw_mosa.py`, which writes `public/studio/seeds/mosa-*.json` on the
`mosa` framework). Keep his design: teal two-tone body, yellow eye, single tooth row, long tail.
Heroes live in `balance.json` "heroes": each is a species id that reuses the shared stage levels,
sizes and depths and swaps in its own stage designs and abilities (`heroStages`, `setHero` in
`src/data/index.ts`; `setHero` swaps the shared `STAGES` array in place). The hero is picked on
the home screen (`settings.hero`); a saved run keeps the hero it was played with (checkpoint `species`).
**White Shark** is the third hero, drawn in the same style as Mike's two (`tools/heroes/draw_shark.py`:
polygon shapes, grey back, white belly, tooth row, yellow eye; framework `white_shark`). Shared hero drawing
helpers (eye-anchored placement, bite frames, blink, egg) live in `tools/heroes/heroart.py`.
**Every hero's hatchling is still inside its egg** (Rhopers' concept, Nov 25, `tools/heroes/hatchling_egg_concept.jpg`):
the egg lies on its side over the middle of the body; the head pokes out of the front through a jagged hole, the tail out
of the back, two little claws out of holes underneath (they paddle), and the shell has zigzag cracks. White shell for the
crocs' and Mosa's, beige for heroes with a white belly (sharks, Fang) and the Elder Croc. One script draws them all from each
hero's JUVENILE design (same poses and canvas): `python3 tools/heroes/egg_hatchling.py [hero]` writes
`<hero>-hatchling.json` (seedVersion 5; the egg's size and place are measured once on the first swim frame so it never
jumps; `bodyRadius` = the egg's half-height, so the egg is the hit circle). Run it after any script that redraws a juvenile
(the older per-hero scripts still write their old eggshell-cap hatchlings). **A new hero gets its hatchling this way too:**
add it to `HEROES` in `egg_hatchling.py`.
**Elder Shark** (id `fang`; called Fang until Nov 26, the id stays so saves keep working) is the fourth hero: a pixel-art great white from a sheet of four poses (idle, swim, attack, hurt) supplied by
Rhopers (`tools/fang/fang_sheet.jpg`). `tools/fang/convert_fang.py` samples each pose to art pixels, maps them to Endesga 32
plus three neutral body greys (its signature colors), turns them to face right and writes `fang-*.json` (framework `fang`, same art
for all three stages; the hatchling is made by `egg_hatchling.py`). The hurt pose is the `damage` frame. Nov 26: the swim is from
Rhopers' new sheet (`tools/fang/elder_shark_swim_sheet.jpg`: IDLE and SWIM with the tail curving down): `tools/fang/update_swim.py`
(runs `build_swim.mjs` with the skin engine, then `egg_hatchling.py fang`) grew the canvas to 100x60 (8 rows above and below; the
mouth moved to [84, 36]), matched the new poses to the old body length, palette, snout and head height, and made move = [idle, swim],
idle and rest = the new idle (seedVersion 4, hatchling 6; `VERSIONS` in `egg_hatchling.py`).
**Elder Croc** is the fifth hero: a pixel-art crocodile from a sheet of poses (idle, walk, bite, hurt) supplied by Rhopers
(`tools/elder/elder_sheet.jpg`). `tools/elder/convert_elder.py` finds each pose as a connected shape on the navy background
(labels and stray bits skipped), samples it to art pixels, maps it to Endesga 32 plus three signature colors (lime body, pale
belly, pink mouth), turns every pose to face right and writes `elder_croc-*.json` (framework `elder_croc`, 100x56 canvas, same
art for all stages; hatchling by `egg_hatchling.py`). Walk = swim (`move`; its first frame is `idle` and `rest`), bite =
`attack`, the standing poses = the level-up roar (`celebrate`), the first hurt pose = `damage`.
**Spino** is the sixth hero: Mike's brown spinosaurus with a tall sail, **one sheet per stage** (Nov 26, `tools/spino/spino_<stage>_sheet.jpg`:
the hatchling is drawn inside its egg by Mike, so `egg_hatchling.py` skips Spino; the adult has a pale belly and pale crackle marks on
its back, a later sheet that replaced the yellow-striped one), each with IDLE, SWIM, SWIM ATTACK and HURT top to bottom, facing left
(except the adult's HURT, which faces right: `FACING` in `build_spino.mjs`). `tools/spino/convert_spino.py` decodes them and runs `build_spino.mjs`, which uses the
Sprite Studio skin engine (`public/studio/skinmaker.js`): clears closed-in white background pockets (between legs), finds the four poses
(labels, splash and blood dots skipped), turns them right, maps colors to Endesga 32 plus three signature browns measured on the sheets
(`SIGNATURE`; Endesga's nearest read red-orange) and places them on the `spino` framework (112x52, mouth [105, 23]). Swim = idle + swim
(idle and rest = idle), bite = swim + swim attack, hurt = hurt, roar = the bite then idle. seedVersion 6 (adult 7, since its sheet was replaced after 6 shipped). (The first Spino,
Nov 25, was blue, from `spino_sheet.jpg`.)
Abilities: croc Shell Guard / Lunge / Death Roll; Elder Croc Lunge / Death Roll / Crushing Bite (armor 0.3, slower); Mosa Dart / Tail Slam / Crushing Bite;
White Shark Dart / Lunge / Feeding Frenzy (a short bite and speed boost on top of the perks); Elder Shark Lunge / Crushing Bite /
Feeding Frenzy (tougher skin than the White Shark); Spino Lunge / Tail Slam / Feeding Frenzy (fast, armor 0.15).

## Sprite Studio -> game (`src/skins.ts`, `public/studio/index.html`)
Every creature look (hero stages and reef creatures) is a studio project id. The menu loads them all with
`loadStageLooks([...ALL_STAGE_SKINS, ...ALL_SPECIES_LOOKS])` (again on focus and on returning home): the studio
copy wins unless it is an untouched, outdated starter (shipped `SEED_STAMPS` timestamp and lower `seedVersion`),
then the shipped seed; Boot's `look:` seed cache is only the last fallback. Studio pose fps reach the game
(`SkinFrames.fps`). Studio rules: `seedStarters()` runs before opening `?project=`, and opening a project keeps
its `updatedAt` (`S.stamp`); only a real edit stamps a new time. The home Sprite Studio card lists every design
with a direct link. `tests/e2e/studio_game.mjs` covers the whole chain. The studio's **Original** button (starter
designs and their `-vN` copies) restores one pose or the whole drawing from `studio/seeds` (with undo; a whole
restore keeps the shipped stamp, so later shipped versions still apply).

**New skin** (`public/studio/skinmaker.js`, a plain ES module the studio page loads as `window.SkinMaker`; pure, unit tested
in `tests/skinmaker.test.ts`): a new look for a hero, from a picture or as a color version, all three stages. The browser
version of what `convert_elder.py` and `egg_hatchling.py` do: background = transparent, or the most common border color, but
only the part connected to the picture's edge (a dark body that matches a navy sheet stays in the sprite) with a tolerance set by
the background's noise; sprites = 8-connected shapes of at least 20% of the biggest; short wide shapes are text labels and
start a new pose group (no labels: one group per row); one shared scale fits the biggest sprite on the hero's canvas (size
slider 50-100%); colors map to Endesga 32 plus up to 3 signature colors (k-means on the far ones); facing = the column profile
compared with the hero's own juvenile (`facesRight`); pose guess per group (a much taller group = Roar, then Swim, Bite, Hurt;
4+ groups = Swim, Swim, Bite, Hurt); placed like the converters (snout fixed for swim and bite); missing poses are made (one
swim frame -> tail sway, no bite -> the jaw opens); hatchling by the egg port (`eggHatchling`, shell and hide per hero in
`SKIN_HEROES`); color versions `recolor` (dark, albino, golden; the outline stays). The wizard (topbar **New skin**, or
`studio/index.html?newskin=<hero>`) shows each sprite with a pose menu and a turn-around button, live previews, a name and
"also make" colors. A skin is saved as `sk-<time>[-<d|a|g>]-<stage>` projects tagged `skinOf: { hero, name, set, stage }`
(serialize keeps it, so editing a skin design keeps it in the skin), and the adult opens for adjusting.
Game: the home screen's **Look** row under the heroes (`renderLookPick`: Original, each complete skin of the picked hero from
`heroSkins(listStudioProjects())`, "+ New skin") saves `settings.looks[hero] = set` (`sanitizeLooks`); `setHeroLooks` +
`loadLooks` load the picked sets; `GameScene.applyLook` uses `heroLookSkin(hero, stage)` (texture `skin_<id>`) and falls back
to the hero's own design. The hero buttons and the home logo show the picked skin. E2E: `skins.mjs` (Rhopers' Fang sheet).

## Terrain (`src/systems/terrain.ts`, art in `src/systems/terrainArt.ts`, `balance.json` "terrain")
The seabed is a ground line (`groundAt(x)`): dunes everywhere, rocky ridges, and seamounts whose plateau tops
reach into the Reef (so juveniles, who can't swim deeper, still see scenery) with coral gardens on top. Islands
break the surface; their sandbank is a ceiling line (`ceilAt(x)`) and their mangrove roots hang below. Hatchlings
see the islands. Solid = below the ground or above an island's underside. `GameScene.collideTerrain` pushes every
swimmer out along the normal each frame (no Arcade bodies for terrain; ramming it fast stuns the player like a rock).
Brains steer away (`AIWorld.terrain.avoid`) and never pick wander points inside it; fish, food, rocks, kelp,
bubbles, skeletons and the crab's home all use the ground line. Mangrove roots and coral gardens are hiding
places (pushed into `kelpZones`). `seabedTop` is still the base of the depth math (areas, depth limits).
Keep the world center clear: the player starts there.
Scenery (`balance.json` "scenery", art in `src/systems/sceneryArt.ts`, painted on a `Grid` and auto-outlined):
pieces sit on the ground line at their x (galleon, a wreck on a seamount top, submarine, whale bones, ruins, an
arch, vents, cannons, chests, a helmet, an anchor). Kinds in `hide` are hiding places; the arch is a ring of rock
circles in the `rocks` group (solid, open underneath); vents puff bubbles and heal the player (`inVent`,
`healPerSecond` of max health). Rocks and kelp keep clear of scenery (`sceneryAt`). Floats (rowboats, a beach
ball, bottles) bob at the surface. Far parallax layers: islands on the horizon (Shallows), faded peaks (Reef).

## The looping world and regions (`src/systems/regions.ts`, `balance.json` "world", "regions")
The sea is `world.width` (114000) wide and loops: x and x + W are the same place. Seven regions left to right
(tropics, then the deep, then the poles; one Tide each): Coral Sea (0-24000; 0-9000 is the original map), Mangrove
Swamp (24000-38000), Sargasso Drift (38000-54000: open blue water, golden weed mats float at the surface and are
hiding places, `scenery.floats` kind `weed`), Volcanic Rift (54000-72000), Twilight Trench (72000-84000: a sea cave, five overlapping `cave` rocks make one roof over
the whole trench, so no sunlight reaches in; high seamount walls either side of a deep floor, glowing sea pens), Kelp Forest (84000-98000: rocky ridges and dense
giant kelp, `makeGiantKelp`, extra patches on top of `world.kelpPatches`), Frozen Sea (98000-114000). The 4 old regions
were doubled on Nov 23 (first half = old layout, second half mirrored); the 7-region order came the same day (the Rift
moved +16000, the Frozen Sea +42000). Saves from the 72000 px sea are moved to the same place (`migrateX`,
`Checkpoint.worldW`). Fish farther than
`ai.sleepDistance` (12000) from the player sleep (`Creature.asleep`: no thinking, no physics body, not drawn) and wake
where they were; `populationScale` grew with the sea; crowd control caps the density (below). Each region has water colors (`regionStops`), ground colors (`makeGround`, chunked to 1024 art px for iPads),
kelp (reeds, tube worms, brown kelp), rock tint, island style (`sand`, `mangrove`, `volcano`, `iceberg`) and music
mood. Volcano islands (`makeVolcano`, cone shape `volcanoRows`/`VOLCANO_REACH`, shared with `landTopAt`) have a
glowing crater, lava streams and cracks, no roots (cone shape in `islandShape.ts`); LightScene makes every vent glow orange; borders blend over `regions.blend` (dithered). Terrain shapes use loop distance and
`wrap(x)`, so the ground repeats. Scenery within `loopOverlap` of an edge is copied past the other edge
(`mirrorEdges`, incl. rock circles, hide zones, vents, swaying kelp). The player wraps at the edges (`loopWorld`
-> `loopShift` moves player, camera, food and bubbles by W in one frame); every fish is kept within W/2 of the
focus (`keepNearFocus`); Brains aim at the nearest copy (`AIWorld.wrapNear`); `inKelp` folds x. Far parallax
layers use texture widths that make W x scrollFactor a whole number of tiles (no jump). Far fish think every third
frame (`LOD_DISTANCE`); far scenery is hidden (`cullStatics`). A region banner shows on entering. New runs start at
`world.startX`. Region gameplay twists come next (plan doc).

## Region twists (`src/systems/regionTwists.ts`, `balance.json` "regionTwists")
Each region plays a little differently (a missing field is 1 = no change): `vision` (every fish's sight there,
via `AIWorld.visionAt` in Brain.decide; Swamp 0.7), `food` (plankton density, Swamp 1.6), and for the player
`hunger` and `speed` (Volcanic Rift hungrier; Frozen Sea slower and hungrier), `ventHeal` (Rift x2, Ice x1.5) and
`ventWarms` (Frozen Sea: resting by a warm vent cancels the hunger and speed twist; the Frozen Sea has 6 vents),
`current` (Sargasso: px/s pushing every awake swimmer east, `updateEnvironment`), `bigSlow` (Kelp: `Fish.envSpeed` for
the adult player and tier 3+ fish), `dark` (Trench: `GameScene.regionDark` eases toward it; LightScene darkens around
the player day and night and lights the plankton).
GameScene: `twistOf(id)` (cached), `twist` (player's region), applied in `applyPerks` (re-run when
`twistKeyNow()` = region + warmed-by-vent changes), `updateVents` and the plankton density. The area banner shows the
twist's `hint` in a smaller line (`HudScene.areaBanner(name, hint)`). E2E: `region_twists.mjs`.

Gates (one per border): Root Tangle (10, bite), Weed Raft (20, bite, golden), Rock Fall (30, ram), Trench Lip (40,
ram), Kelp Curtain (50, bite), Ice Walls (60, ram, both sides of the Frozen Sea). Gate styles: roots, weed, kelp
(strands painted with their palette), rocks, ice.

## Gates between regions (`src/systems/gates.ts` rules, `src/scenes/GateSystem.ts` art and play, `balance.json` "gates")
Each Tide opens the next region: Root Tangle (Coral Sea -> Swamp, x 24000, after the level 10 crab, bite it 5x with EAT),
Rock Fall (-> Volcanic Rift, x 38000, crab 20, ram 4x), two Ice Walls (-> Frozen Sea, x 56000 and 71900 at the loop's
seam, crab 30, ram 4x). A wall spans the whole water column, is solid for the player only (fish slip through), shows 3
crack stages, then breaks with bursts and a banner (`HudScene.bigBanner`). Too early: pushed back plus a "Beat the level N
Checkpoint Crab" popup. Rams count the speed aimed at the wall above `gates.ramSpeedRatio` x cruise (or a dash); the wall
bounces you back (`bounce`) so holding forward keeps ramming. Broken gates are saved (`Checkpoint.gatesOpen`), kept by
SWIM AGAIN (`nextGatesOpen`); saves from before gates keep the whole sea open (`openedFromSave`). Walls near the seam
get a copy past the edge. Tests that are not about gates call `gates.openAll()`. Leopard Seal unlocks at 31 and the
Giant Octopus at 21, when their regions open. E2E: `tests/e2e/gates.mjs`; unit: `tests/gates.test.ts`.

## Leaping and land (`GameScene` "Land" section, `balance.json` "land")
- Sprint upward through the surface to leap (`checkLeap`: sprinting, near the surface, rising faster than `jumpSpeed`). No extra button.
- `landState` is 'water', 'air' or 'land'. `updateOutOfWater` applies gravity, lands on islands, crawls and hops. `collideTerrain` skips the player out of the water.
- **Islands rebuilt (Nov 27, `src/systems/islandShape.ts`, pure; `tests/islands.test.ts`)**: one profile per island (`islandProfile`:
  solid art rows above the water per art column, for sand, mangrove, iceberg, volcano and cave rock) feeds BOTH the drawing
  (`terrainArt` paints the land body from it, `landRows`) and the game (`IslandLand`: one lookup of the land's top over the whole
  looping sea; `GameScene.islandLand`, `landTopAt` = `islandLand.topAt`). Before, the drawing, the underwater underside and a
  hand-written standing guess disagreed (an invisible ledge over mangroves, iceberg jags missing, one row off on volcanoes and
  cave rocks) and islands had no sides in the air. Now: mangroves have a drawn 2-row mud bank to stand on; iceberg jags are a
  fixed hash (`jag`); the sand hump's top row is exactly the top you stand on. Out of the water the hero is moved by
  `updateOutOfWater` alone (`arcadeBody.moves` off) in steps of at most one art pixel: land higher than the feet is a wall from
  the side (`highestTop` over the feet's width), landing only happens falling onto the top, crawling climbs gentle slopes (about
  1.5 rows per column) and stops at walls, and standing still keeps the hero level. The underwater part is still the Terrain
  ceiling line (the drawings follow it exactly). E2E: `islands.mjs` (every land column's top row is drawn, for every style; a
  mangrove landing; a leap into an iceberg stops against it).
- `updateDrying`: safe for `drySafeSeconds`, then `dryDamagePerSecond` of max HP. Death cause 'dried'. The HUD shows the countdown and a warning.
- E2E: `tests/e2e/land.mjs`.

## Enemy settings (`src/data/adminSettings.ts`, Options > Enemy settings)
Per enemy (species with a population), in sections When / Where / How many / Variety / Strength and behavior:
the spawn factors (below), region weights, depth, appears from level, how many, aggression, vision, top speed, health,
bite, fights-above-its-size. Saved on the device (`ce.admin.enemies`, only differences from shipped), clamped to safe
ranges, applied at startup (`main.ts`) and on Save to the shared SPECIES/BALANCE objects; Reset all.

## Day and night (`src/systems/dayNight.ts`, `src/scenes/LightScene.ts`, `balance.json` "dayNight")
Four periods (Dawn, Day, Dusk, Night) loop; `DayNight.lightAt(seconds)` holds each period's look and blends
neighbors over `blendSeconds` (smoothstep, centered on the change). GameScene keeps `dayTime` (saved in the
checkpoint), `light` and `period`; it colors the sky, fades rays, moves the sun and moon, twinkles stars, and
sets food `density`/`glow`. Brains read `AIWorld.light`: vision (prey vs predators, tier >= 3), predator hunger
at dawn/dusk, sleepy small fish at night. LightScene (between Game and Hud, own unzoomed camera) draws the water
tint, the darkness with a soft opening around the player, and glowing plankton dots above it; it positions them
on PRE_RENDER so they line up with the game camera. HUD: clock (name + progress bar) and a calm period banner.

## Checkpoint Crab (`GameScene` "Checkpoint Crab" section, `balance.json` "checkpointCrab")
Every `everyLevels` (10) levels a crab (species `checkpoint_crab`, look `crab-checkpoint`, drawn by
`tools/heroes/draw_crab.py`, `upright` so it never tilts) appears near the deepest water the player may swim in.
It is a `guardian` creature: its Brain stays in its home band, chases only the player within `guardRange`,
never flees; other fish ignore it; it can't be swallowed. Its health (about `hitsToDefeat` of the player's
bites) and pinch (`pinchHpFraction` of the player's health + stun) are set from the player when it appears.
Defeating it sets `crabLevel` (saved in the checkpoint). After dying, SWIM AGAIN restarts at `crabLevel`
(or level 1), with perks. This replaced the old "back to the start of your stage" rule.

## Tides and endless levels (`balance.json` "tides", helpers in `src/data/index.ts`)
No level cap (`stages.maxLevel` is a practical 999). A Tide is 10 levels (`tideOf`, `tideName`: themes repeat
as "+" versions); the Checkpoint Crab ends each Tide. Past the adult stage (level 30) are Legend levels
(`legendLevel`): the body stays adult-sized (stage `to` 30, `across` clamps), rank and power grow
`legendRankPerLevel` per level (`formAt`), and a perk comes every `legendPerkEvery` levels (`perksEarned`).
Reef fish spawn `aiLevelBonus` levels higher in later Tides. Each level needs at least `levelStepMin` (15%) more XP than
the one before (on top of the curve with `levelHardness`), up to `levelHardnessMaxLevels` (40); after that the
normal curve carries on (a few % per level), so endless levels stay reachable (`xpToNext`, memoized). Tide visuals and music come later.

## Hatchling head start (`balance.json` "earlyHelp", `earlyHelpMods` in `src/systems/perks.ts`)
New hatchlings swim `speed` faster, turn `turn` quicker, drain sprint stamina at `stamina` x (sprint lasts longer) and
take `damageTaken` x damage, fully up to level `fullUntil` (5), fading evenly to nothing at `endsAt` (15). It multiplies
into the player's mods with the perks (`applyPerks`, refreshed whenever the level changes; `PerkMods` gained `turn`
and `stamina`). The pause menu shows the current head start. AI fish are unchanged.

## Map (`map.html`, `src/map/main.ts`, pure model and checks in `src/map/model.ts`)
A second Vite page (`build.rollupOptions.input`: main + map; precached by the service worker, so it works offline), linked from
the Sprite Studio card ("Open the map of the sea") and openable at a spot with `map.html?x=2400`. Phase 1 (Nov 26) = view and
checks; editing is planned in phases (plan doc "Map editor"). `buildMap(BALANCE)` turns the world into `things` (islands,
seamounts, ridges, scenery, floats, gates, caves, the start; ids like `island:3` = index in balance.json) and builds the game's own
`Terrain`, so the seabed drawn is the one you swim through. The canvas squeezes the sea sideways (`view.s` world px per screen px,
whole sea = `W / screen width`) and always fits the full depth (sky, water in the region's 4 colors, ground by kind, islands by
style, depth bands and names); drag/pinch/wheel/buttons/arrow keys; region buttons jump; tap = `hitTest` (point things within 16 px,
then an island above its underside, then the seamount or ridge near the ground) or the region summary. `mapChecks` (errors and
warnings, `CHECKS`): regions cover 0..width with no gaps, things inside the world, nothing solid near the start (scenery you swim
past is fine, the arch counts), gates within `gateSnap` of a border, each cave entrance reachable by the stage at its boss's level,
at least `passage` px of water under every island, islands not overlapping (cave rocks overlap on purpose), big scenery (`FOOTPRINT`
>= 250) not drawn over each other. Today's map has none. `window.ceMap` is for tests. E2E: `map.mjs`; unit: `tests/map.test.ts`.
**Edit (Phase 2, `src/map/edits.ts`, pure; `tests/mapEdits.test.ts`)**: the Edit button (or `map.html?edit`) adds a second header row
(Undo, Redo, + Add, Export file, Reset all). Editable lists (`MapLists`): islands, seamounts, ridges, scenery pieces, floats and each
boss's cave entrance x (`LIST_OF`; gates and the start stay put until region editing, Phase 4). Drag a thing to move it (only things,
the map does not pan then), the details panel has sliders (`LIMITS`: width; island depth, seamount top, ridge height; scenery scale),
an island Look menu and Delete (not caves); Add puts the picked kind (`addChoices`: island styles, seamount, ridge, every scenery and
float kind already shipped) in the middle of the screen. Every change is checked at once (Problems updates) and saved on the device as
the lists that differ from shipped (`ce.admin.map`, with a `fingerprint` of the shipped lists: a later update shows a "the game was
updated" warning). The game applies them at startup (`applyMapEdits` in `main.ts`, after the enemy settings), so they show the next
time the game opens. Export file (`exportMap`) + `node tools/map/import_map.mjs <file>` writes them into balance.json for everyone.
`hitTest` also checks the height (scenery and caves on the seabed, floats at the surface), so grabbing an island never grabs a
nearby wreck. E2E: `map_edit.mjs`.

## First minutes coach (`src/systems/coach.ts` pure, `HudScene.updateCoach`, `src/ui/coachStore.ts`)
A new player's first run teaches by doing: one line near the top (`coach` text object), each step moving on as soon as it is
done: swim 400 px (`coachMoved`, wrap jumps ignored), eat 5 plankton (`stats.plankton`), swallow a fish (`stats.fish`), bite
(`GameScene.playerBites`), reach level 2; then "Nice! ... Checkpoint Crab" for `DONE_SECONDS`. Wording follows the controls
(touch joystick + EAT, keyboard Space, controller A). Steps can complete together. While the coach talks, the bottom help line
stays hidden. After the steps, one-time tips show for `TIP_SECONDS` when they matter (stomach >= 90%, being hunted). Saved per
player: `settings.coachDone`, `settings.tipsSeen` (players with 3+ runs before the coach existed count as done); Options > Tips for
new players > Show again resets both. Bots (`?bot`) and Try in game (`?try`) never see it. E2E: `coach.mjs`; unit: `tests/coach.test.ts`.
CI runs the game at about 10 fps (software rendering), so e2e tests wait on progress (`waitFor`), never on fixed seconds of play.

## Playtest log (`src/ui/playLog.ts`, recorded in `menu.ts`)
Every run on the device goes into `ce.playlog` (last 60; private, never sent; carried in the backup file): player, hero, seconds,
start and end level, how it ended (`died` with cause and region, `home`, or `closed` = the page closed mid-run via `pagehide`),
kills, fish, coach finished. `ce:run` carries `seconds`, `startLevel` (`GameScene.runStartLevel`), `region`, `hero`.
Options > Playtest log shows `playReport` (runs, days, typical run length, runs under a minute, best level, runs reaching the first
crab, endings, deaths by cause and region, heroes, the last 30 runs) with Copy report / Save file / Clear. `summarize` and
`playReport` are pure (`tests/playlog.test.ts`). E2E: `playlog.mjs`.

## Performance meter (`src/ui/perfMeter.ts`)
Options > Performance meter (remembered, `ce.perf.show`) or `?perf=1` shows a corner panel, updated twice a second: fps, the
slowest 5% of frames as fps ("slowest"), the worst frame, creatures (all / awake / drawn), display objects, textures, renderer
size and pixel ratio, JS memory where the browser reports it. Always on and cheap: a session log (`ce.perf`, last 20; written when
the page hides or closes after 30+ s of play) with fps, slowest, hitch share, most creatures awake/drawn and a grade
(`smooth` >= 55 fps and slowest >= 40, `ok` >= 40/25, else `choppy`); Options shows the last one, and it travels in the
backup file. Stats helpers are pure (`summarizeFrames`, `grade`; `tests/perf.test.ts`). `window.cePerf` (seconds, log) is for
tests. Nov 25 baseline in CI (software rendering): the game's own update is ~3-5 ms per frame with ~200 creatures awake; the
rest is drawing, so measure on the real iPad before optimizing. E2E: `perf.mjs`.

## Offline, install and backup (`vite.config.ts` VitePWA, `src/offline.ts`, `src/save/backup.ts`)
The game needs no internet after the first visit. `vite-plugin-pwa` (generateSW) precaches the whole build: code, atlas,
music, the bundled fonts (`public/fonts`, Pixelify Sans and Work Sans under the OFL; no Google Fonts), Sprite Studio,
`skinmaker.js` and every starter design. `ignoreURLParametersMatching: [/.*/]` makes links with `?project=`, `?newskin=`,
`?try=` work offline; `navigateFallbackDenylist` keeps studio links from falling back to the game page. `registerType: 'prompt'`:
a new version waits for the home screen's "New version ready: tap to update" (`ce:update-ready` -> `#btnUpdate` ->
`applyUpdate`), so a run is never reloaded mid-swim; `ce:offline-ready` shows a badge. `startOffline()` also asks for
persistent storage. The manifest (fullscreen, any orientation) and icons (`tools/icons/make_icons.py`: Mike's croc on a sea
tile, a maskable one for Android) make it installable (iPad "Add to Home Screen", Android "Install app").
Never load anything from another site at runtime (the offline test checks it). Options > **Backup**: Save file downloads every
`ce.*` and `spritestudio*` key (saves keep their checksums; not the problem log) as `creature-evolution-backup-<date>.json`;
Load file checks it (`parseBackup`), asks, replaces those keys and reloads. E2E: `offline.mjs`; unit: `tests/backup.test.ts`.

## Players and save slots (`SaveManager`, home screen "Playing as" chip and Saved games)
Up to `MAX_PLAYERS` (4) players share a device (`ce.save.players`: list + active one). Each player has their own profile
(settings incl. picked hero, records, lifetime; player 1 keeps `ce.save.profile`, others `ce.save.profile.pN`) and, for
every hero, `SLOT_COUNT` (5) save slots with names (`profile.slots[hero] = { active, names }`). A run is saved under
`ce.save.run.p{player}.{hero}.{slot}` (with its own `.bak`). Picking a hero on the home screen switches to its slots and
CONTINUE (`pickHero`); Saved games shows "<player>'s <hero> games" with creature tabs. Who's playing? (the chip): add (copies
sound and controller settings), rename, delete (with its games; never the last player), switch (writes the active player and
reloads the page, since the menu holds the profile in closures). Saves from before players (3 slots shared by every hero,
`ce.save.checkpoint[.N]`) move once to player 1, each into the next free slot of the hero it was played with, keeping
custom names (`migrateToPlayers`, run by the first `loadPlayers`). Switch players and slots only from the home screen,
never mid-run. Text inputs stop Enter's default (it would also press the button that gets focus next).
E2E: `slots.mjs`; unit: `tests/save.test.ts`.

## Higher-level enemies
Species with `unlockLevel` only join the reef once the player reaches that level (`spawnAmbientFish`
skips them; `spawnUnlocked` adds them on level-up with a NEW banner and the species' `intro`).
Lionfish (6, `venom`: biting or swallowing it costs the player health), Moray Eel (14, `behavior.ambush`:
lurks, one lunge per hunt, short chase), Barracuda (22, pack hunter). `rankMul` lets a slim fish fight
above its size (AI rank and power = size x rankMul). Looks drawn by `tools/fish/draw_fish.py`.
More creatures (`tools/fish/draw_more.py`, which imports the helpers from `draw_fish.py`): Archerfish (swamp prey),
Polar Cod (ice prey), Bull Shark (16, swamp), Leopard Seal (31, ice, shallow), Anglerfish (21, the Deep, `ambush`,
`lure`: a glowing dot drawn by LightScene at that offset in body radii), Great White Shark (25, `ambush`, strikes
from below), Sperm Whale (30, framework `whale`, 192x72 canvas, `armor`, mostly calm, hunts tier 4). Drawings may be
up to 192 px wide (`validateProject`, studio size inputs). When several enemies unlock at once, each gets a banner.
Not fish (`tools/fish/draw_beasts.py`, looks `beast-*`): Box Jellyfish (8, `alpha` see-through, `venom`), Sea Snake (12),
Giant Octopus (21, Volcanic Rift, `ambush` + `camo`: while slower than `ai.camoStillSpeed` it fades to `ai.camoAlpha`
and `isHidden` hides it from fish farther than kelpSeeThroughDistance x its size; `Fish.camouflaged`), Giant Squid
(24, the Deep), Orca (33, Frozen Sea, pods via `schooling`, hunts tier 4). Soft-bodied animals leave a pale body, not a skeleton.

Twilight Trench (`tools/fish/draw_trench.py`, which imports `draw_fish` and `draw_beasts`): Lanternfish (40, prey schools,
more at night), Viperfish (41, `ambush`, `lure` on its dorsal ray, fangs), Vampire Squid (42, harmless, eats plankton,
`cloud`: when the bigger player comes within `trench.cloudRange` body sizes it puffs glowing slime, the player is blinded for
`cloud` seconds (`GameScene.blindT`, LightScene `glare`) and it flees; then `trench.cloudCooldown`; one cloud at a time),
Gulper Eel (44, `devourRatio` 1: swallows fish its own size). `glow` (a color) gives a body glow drawn by LightScene,
brighter in the dark. All four live only in the Trench. E2E: `tests/e2e/trench.mjs`; unit: `tests/trench.test.ts`.

Sargasso Drift (`tools/fish/draw_sargasso.py`, all unlock at 20 to 25 and live in the Sargasso): Flying Fish (prey schools
near the surface), Sargassum Fish (`camo` ambusher in the weed), Mahi-mahi (20, golden packs), Yellowfin Tuna (22, fastest
sprinters), Sailfish (25, sail and bill, `ambush`), Man o' War (drifts at the surface, `venom`, see-through) and the
**Green Sea Turtle** (`friendly`: the player can't eat or bite it and no fish hunts it; `armor`). A diet may name a species id
as well as tiers (`Brain.dietAllows`): the turtle's diet is `man_o_war`, so it eats them. E2E: `sargasso.mjs`.

Kelp Forest (`tools/fish/draw_kelp.py`, all live only in the Kelp Forest, Tide 6): Garibaldi (50, bright orange prey),
California Sheephead (51, eats tier 1 and `sea_urchin`, buck teeth), Purple Sea Urchin (50, creeps near the seabed at
`maxSpeed` 25, `venom`, `upright`), **Sea Otter** (52, `friendly` like the turtle, diet `sea_urchin`) and California Sea Lion
(55, fast agile pack hunter, `rankMul` 5). E2E: `kelp.mjs`; unit: `tests/kelp.test.ts`.

## The Fisher Ape (`src/scenes/FisherSystem.ts`, rules in `src/systems/fisher.ts`, `balance.json` "fisher")
Rhopers, Nov 27 (from his sheet `tools/fisher/fisher_ape_sheet.jpg`; `tools/fisher/convert_fisher.py` keeps idle x3, walk x3, cast,
hook, catch and celebration x2, wipes the drawn line and fish from HOOK, makes background-blue pockets see-through and runs
`build_fisher.mjs` with the skin engine: feet on the bottom line, face in column 21, framework `fisher_ape` 48x48, look
`beast-fisher_ape`, in `EXTRA_LOOKS` so Boot, the menu and the studio load it like a species look). Not a swimmer: a monkey in a
rowboat (`w_float_rowboat`, depth 9; he stands in it at `artScale` world px per art px). One at a time: after `firstAfter`, then every
`everyMin`-`everyMax` s, by day in the Coral Sea and Mangrove Swamp (`canVisit`; never in a boss cave), he rows in from off screen
(`arrive`), casts (`cast`, attack frame 0), the line goes in past the boat's end (`castX`) with a red-and-white bobber and a hook
(Graphics, any depth) and drops (`drop`) to a small fish's depth or `hookDepthMin`-`Max` of the water, waits, reels (`reel`, attack
frame 1). Fish up to `catchMaxSize` touching the hook are reeled up and caught (`respawnAmbient`, `catch` = celebrate frames). The hero
touching it is HOOKED: `hookDamage` (`hookDamageFraction`, never the last bit of health); stages in `pullStages` are pulled toward
the hook at `pullSpeed` until EAT is held (bites the line) or `breakSprintSeconds` of sprinting ("Free!"); reaching the surface
gives another small hit and drops them back; an adult just gets stung ("Snap!"). `rehookSeconds` of safety after. Ramming the boat
from below (swimming up fast within 0.35 s, `boatHitSpeedRatio` x cruise) or leaping into it counts a hit ("Bonk!");
`boatHitsToScare` hits scare him off ("Scared off!", `scareXpShare` of a level in XP). He leaves (`leave`) after `catches` catches or
`stay` seconds, or is gone at once if the player gets far away or enters a cave. First visit per run: a NEW banner. Tests:
`fisher.spawnNow(side)`. E2E: `fisher.mjs`; unit: `tests/fisher.test.ts`.

## Bosses (`src/scenes/BossSystem.ts`, rules in `src/systems/bosses.ts`, art in `src/systems/arenaArt.ts`, `balance.json` "bosses")
Each boss has its own **arena, a separate screen** (Rhopers, Nov 25, end to end): (1) a SMALL cave entrance sits on the
seabed in the open world, in the background (`makeCaveEntrance`, depth -11: in front of coral, behind every fish; a small
"CORAL CAVE" label). The Electric Eel's is at `entranceX` 2400 on a Coral Sea seamount top a juvenile reaches. (2) Swimming onto
it (`entranceSpot`, within `arena.enterRadius`) ALWAYS asks: `askCave` -> `ce:cave` (mode `enter`) -> the menu pauses and asks
"Enter the cave" / "Not now" (`answerCave`); before `level` a popup turns you back; after an answer or coming out it asks again
only once you were `askAgainRadius` away. (3) Enter: you appear in the arena, a closed cave BELOW the world (`arenaLayout`: `outer`
= the whole picture, `inner` = open water, `exit`, `air` pocket, `start`, `boss`; at world height + `gapBelowWorld`, under the
entrance's x; drawn by `makeArena`: rock walls, stalactites, sandy floor with coral, an air pocket in the ceiling, the EXIT
tunnel lit from outside, an "EXIT" label). The camera is bounded to `outer` (only the arena shows); physics bounds reach down to
it; `collideArena` keeps the player and the boss in `inner` (no seabed down there; brains of bosses skip terrain steering);
`updateAreas` skips depth rules; it is dim (`caveDark`). (4) Swimming into the EXIT tunnel asks "Leave the cave?" (mode
`leave`): Leave = back above the entrance (`leaveArena`, the boss heals `regenPerSecond`), Stay = nudged out of the tunnel, asked
again only after swimming back in. (5) Losing inside never ends the run (`playerDied` -> `arenaLoss`): you wake at the entrance with
`lossHpFraction` health, `lossInvulnSeconds` safe, the boss back to full (`healFull`). A checkpoint written inside saves you at the
entrance. `init()` resets the arena state; bot and test swims are never asked in. (The earlier versions, an open-world cave in the
swamp and then a cave chamber in the Coral Sea, are gone.)
The fight: the boss spawns when you come in (BossSystem only for `host.arena()`), a guardian (`Creature.boss`) with a `BossBrain`
whose `mode` BossSystem drives: hunt -> charge (crackles for `shock.telegraph` s, a growing warning ring) -> shock ring; hunt ->
rise (to the air pocket) -> gulp (`breath.gulp` s, your bites x `breath.damageMul`, the boss bar turns yellow); below
`leap.belowHealth` shocks come faster and it leap-shocks the air pocket while gulping. Health = `hitsToDefeat` of your bites; its
bite and shocks take shares of your health (`hurtPlayerBy`, capped by maxHitFraction). Beaten: XP (`rewardLevels`), full health,
a free perk pick (`rewardPerks`; `bossPerks(bossesBeaten)` is added to `perksOwed`; the choice opens `bosses.perkDelaySeconds`
after the banner), the trophy (Insulated: shocks x `trophyShockMul`, `shockMul`), banner, saved (`Checkpoint.bossesBeaten`, kept
by SWIM AGAIN via `nextBossesBeaten`); it never comes back in that run (the arena stays open and quiet). HUD:
`HudScene.bossBar`. Music: Crab Showdown nearby. Saves keep `worldW` and `bossesBeaten`. E2E: `boss.mjs`; unit:
`tests/bosses.test.ts`.

## Region fish (`balance.json` "biomes", `pickHomeX` in `src/systems/regions.ts`)
Each species has a weight per region (0 = never there; missing = 1, read with `biomeWeight`). `spawnAmbientFish`
shares a species' fish out by weight x region width; each Creature gets `homeX(near?)`: Brains use it for wander
targets (stay within `roam` px while the region suits them and the spot does not cross into a region they like less,
otherwise head for a liked region) and `respawnAmbient` uses it too. Hunting and fleeing can still carry a fish
across a border; wandering brings it home. The weights are editable per enemy in Options > Enemy settings
("In Coral Sea", ...). E2E: `tests/e2e/creatures.mjs`; unit: `tests/creatures.test.ts`.

## Enemy spawn factors (`src/systems/spawnFactors.ts`, `balance.json` "spawnDefaults" + "spawnFactors")
Per enemy, over the defaults: WHEN lastLevel, activity per period (dawn/day/dusk/night share out), waveEvery/waveStay,
respawnDelay; WHERE region weights ("biomes"), depth (species spawn), nearPlayer, roam; HOW MANY count (population),
perTide, groupMin/groupMax, maxHunters; VARIETY levelMin/levelMax, eliteChance/eliteLevels. GameScene: `spawnSpecies`
spawns in groups with rolled levels (`rollLevel`, elites get a golden tint, `Fish.setElite`); each fish has a `slot`
(0..1) and `updateSpawnFactors` (once a second of game time) marks `away` the ones above the species' `outShare`
(away fish sleep like far ones and come back off screen via `placeAmbient`), and tops up counts on a new Tide;
`respawnAmbient` applies nearPlayer, levels and `respawnT`; the creature loop caps hunters per species (`maxHunters`,
`brain.forget`). Brains, player eating and rams ignore sleeping fish. All factors are sliders in Options > Enemy settings,
in sections (`EnemyField.group`, `ENEMY_GROUPS`). E2E tests pick fish with `!c.away`. E2E: `spawn_factors.mjs`.

## Crowd control (`src/systems/crowd.ts`, `balance.json` "crowd")
Keeps the sea lively but never packed. (1) Region density cap: `regionMaxDensity` fish per 1000 px; species counts x
`populationScale` are spread by region weight x width, and a region above the cap thins every species there alike
(`GameScene.crowdFactors`, set in `spawnAmbientFish`; `targetCount` x `keptShare`, `homeX` weights x the factor). Before
this, single-region species (archerfish, polar cod, lanternfish) were 2 to 3x denser than the original reef because the
world grew more than their region. (2) Tide growth capped at `maxTideMul` x the base count. (3) Outgrown fish: once the
player's rank is `outgrownRankRatio` x a fish's, only `outgrownShare` of them stay out (`outgrownMul` in
`updateSpawnFactors`). (4) Screen budget: at most `nearMax` awake fish within `nearRadius` of the player; extra ones off
screen nap (`Creature.crowded`, asleep like far fish), farthest first, and wake off screen below `nearWake`
(`updateScreenBudget`, `trimCrowd`; never hides a fish in view). (5) `maxHuntersTotal` fish of all kinds hunt the player
at once. E2E: `crowd.mjs`; unit: `tests/crowd.test.ts`.

## Rams and bumps (`GameScene.updateRams`, rock collider)
A ram counts only the speed aimed into the target (`Fish.lastVx/lastVy` along the line to it), never a graze.
Ramming a fish stuns it and knocks it aside; it halves your speed only if it is clearly stronger
(`combat.ramSlowRankRatio`, 1.25x your rank). A rock stuns you only on a head-on hit. (Before Nov 23, brushing past
a same-size tang at normal speed halved your speed: the "small breaks" in swimming.)

## The bite timeline (`GameScene.startBite` / `updatePendingBites` / `snapBite`, `balance.json` combat `bite`)
Rhopers, Nov 27 (replaced the Nov 26 one-second delay). Every bite is wind-up (jaws opening) -> the hit (jaws snap shut) ->
recovery, like startup / active / recovery in fighting games; one entry per biter in `pendingBites` (`PendingBite`).
- **Player:** pressing EAT (Space, A, right mouse) opens the jaws (`windup`); holding keeps them open (`hold` phase,
  `Fish.jawSpeed` = `holdSpeedMul`, swallowable fish that swim in are still swallowed) up to `holdMaxSeconds`; letting go snaps
  them shut (a quick tap snaps right after the wind-up). The hit picks the nearest creature in reach that is too big to swallow
  (`playerBiteTargetNow`); held past the wind-up adds up to `chargeDamageBonus` (full at `chargeSeconds`, shown as `-N!`). A press
  with a swallowable fish in reach swallows instead. No creature in reach: a chunk of meat too big to swallow is bitten into 2 to
  `meatBreakMaxPieces` smaller pieces (`breakMeatAtMouth`, each `meatBreakPieceMul` x devour size, always under 70% of the chunk),
  so any carcass can be eaten bit by bit; otherwise a whoosh.
- **Creatures:** `startBite` winds up `aiWindup` + `aiWindupPerTier` per size tier (max `aiWindupMax`), a readable telegraph; the
  bite lands only if the target is still within `landReachMul` x the reach ("Dodged!" otherwise).
- **The hit** (`bite(.., started, big)`): damage, hurt frame and red flash, chunks, sound, popup, and **hit-stop**: the biter and
  the target freeze for `hitstop` (`hitstopBig` for a full charge or a kill; `Fish.freeze`, which keeps the velocity, knockback
  included, and pauses the timeline). Only those two freeze, never the game. Getting bitten or stunned before your bite lands
  cancels it (`cancelJaw`). Dash bites and the grab abilities hit at once; `bite()` itself stays instant (tests call it).
- **Look** (`Fish.openJaw/holdJaw/snapJaw`, `jawFrame`): the wind-up plays the bite frames up to the widest-open one, holding
  shows it, the snap plays the frames after it (none: the closed swim frame). Sprite Studio's bite pose has a **Jaws open on this
  frame** button (`open` on the attack pose, kept by serialize; `poseMap().biteOpen`); default the last bite frame.
- The coach says "hold EAT to open wide, let go to bite". E2E: `bite_timeline.mjs`; unit: `skins.test.ts` (the marker).

## Player damage rules (`GameScene.attackPlayer`)
AI never swallows the player. Predators that could swallow you "chomp" (x1.5 damage);
every hit is capped at `playerDefense.maxHitFraction` of max HP, then knockback +
invulnerability. Armor per species (`armor` in species.json).

## Rules
- **Art comes from the single atlas** (`ATLAS` in `src/assets.ts`):
  `scene.add.image(x, y, ATLAS, 'frame_name')`. Do not load loose PNGs at runtime.
  To add art: drop the PNG in `art/...`, run `npm run atlas`.
- **Pixel art direction** (plan in the Game Design Plan doc): every sprite uses the Endesga 32 palette
  (`public/studio/palette-endesga32.json`) plus at most 3 signature colors per creature; textures hold
  1 pixel per art pixel and use smooth pixel art (`texture.setSmoothPixelArt(true)`); small effects
  (bubbles, food) come from `src/systems/pixelTextures.ts`. The world (water bands, rocks, kelp,
  light rays, far silhouettes; ground, islands and coral in `terrainArt.ts`) is generated in `src/systems/worldTextures.ts` and drawn at
  `WORLD_PX` = 4 world px per art px; rock collision circles and kelp zones keep their old sizes. Camera zoom changes only per stage.
  Reef fish looks are Sprite Studio starter designs (`public/studio/seeds/fish-*.json`, drawn by
  `tools/fish/draw_fish.py`), linked by `look` in species.json, built once per scene.
  Target pixel density: about 3.5 world pixels per art pixel (size / bodyRadius).
  Play screen is minimal (Rhopers): compact bars with 8x8 pixel icons (`hudIcon`, `BAR_X/BAR_W`), an LV badge,
  perk icons; the help line fades after `HINT_SECONDS`; full numbers are in the pause menu (`detailsHtml`).
  Interface: labels, numbers and banners use the pixel font Pixelify Sans (`--font-display`, HUD `FONT`);
  longer help text stays in the plain body font. Perk icons are 16x16 pixel grids in `src/ui/perkIcons.ts`
  (no emoji). The home logo animates the picked hero's adult design.
- **No Phaser ParticleEmitter for now**; use the pooled `Bubbles` helper or
  similar plain-image pools.
- Use Arcade Physics with **circle bodies only** (fish rotate; circles do not care).
- Keep it touch-first: every action needs a touch path (button or gesture).
- Controllers: `src/input/gamepad.ts` (`pads`, browser Gamepad API, standard layout, every pad counts,
  one poll per frame shared by game, HUD and menus). In game: stick/D-pad swim, A eat, B/LT/RT sprint,
  X/Y/RB ability, Start pause. Menus: D-pad moves focus (`.pad-focus`), A presses, B goes back (never skips
  a perk choice). Death screen: A swim again, B home. New actions need a controller button too.
  Button mapping: in-game actions (`PadAction`: eat, sprint, ability, pause) go through `pads.map`
  (`pads.act` / `pads.actJust`), set in Options > Controller buttons (Change / Add / Default buttons; the next
  pressed button is captured while the menu's own pad handling pauses) and saved as `settings.padMap`
  (null = defaults, checked by `sanitizePadMap`; a button does one action; no action is left without one).
  Button names follow the controller family (`padStyle`: Xbox, PlayStation, Switch). Menus stay on D-pad, A, B.
- Phaser 4 API reference for agents: `node_modules/phaser/skills/*/SKILL.md`.
  Read the relevant skill before using an unfamiliar API.
- Only CC0 assets (or clearly licensed for commercial use). Log every asset in
  `CREDITS.md`. Never use names, art or species designs from Feed and Grow: Fish.
- Deliver changes as pull requests, not direct pushes to `main`.

## Roadmap (one-week sprints)
- [x] Sprint 0: setup, atlas, data files
- [x] Sprint 1: swim feel, world, kelp, rocks, camera zoom, touch controls
- [x] Sprint 2: plankton (auto-eat on mouth contact), swallow smaller fish (Space/E/right-click/EAT), XP, level-ups, mouth ring, HUD growth bar
- [x] Sprint 3: AI brains (wander+schooling, flee, hunt with stalking vs player, forage plankton, rest, hunger/desperation), kelp hides fish, player can be eaten (death screen, restart), Easy/Normal/Hard
- [x] Sprint 4: bite (anything too big to swallow) with meat chunks, kills + skeletons, ram stun, rock impact stun, critical wounds, wounded state + distress, HP regen, AI biting/retaliation, death by bite, Dash (E/Q/DASH)
- [x] Sprint 5: stomach (1/3 XP now, 2/3 banked; 95% full; rest above 75% to digest; metabolism; starvation), procedural SFX, CC0 music, heartbeat when hunted, start screen, sound toggle
- [ ] Sprint 6: playtest, balance, itch.io release
