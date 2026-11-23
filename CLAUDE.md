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
  (`GameScene.update` -> `step`) and the light overlay catch errors, log each once (`ce:error`, `frameErrors`) and
  keep running. CI runs the browser suites in three parallel shards (`browser-shard`); a new e2e suite must be
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
**Every hero's hatchling hatches from an egg**: it sits in a broken shell and wears a shell cap
(`heroart.egg`; the shark's shell is beige so it stands out from its white belly).
Abilities: croc Shell Guard / Lunge / Death Roll; Mosa Dart / Tail Slam / Crushing Bite;
White Shark Dart / Lunge / Feeding Frenzy (a short bite and speed boost on top of the perks).

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
The sea is `world.width` (36000) wide and loops: x and x + W are the same place. Regions left to right: Coral Sea
(0-12000; 0-9000 is the original map), Mangrove Swamp (12000-19000), Volcanic Rift (19000-28000), Frozen Sea
(28000-36000); each has water colors (`regionStops`), ground colors (`makeGround`, chunked to 1024 art px for iPads),
kelp (reeds, tube worms, brown kelp), rock tint, island style (`sand`, `mangrove`, `volcano`, `iceberg`) and music
mood. Volcano islands (`makeVolcano`, cone shape `volcanoRows`/`VOLCANO_REACH`, shared with `landTopAt`) have a
glowing crater, lava streams and cracks, no roots; LightScene makes every vent glow orange; borders blend over `regions.blend` (dithered). Terrain shapes use loop distance and
`wrap(x)`, so the ground repeats. Scenery within `loopOverlap` of an edge is copied past the other edge
(`mirrorEdges`, incl. rock circles, hide zones, vents, swaying kelp). The player wraps at the edges (`loopWorld`
-> `loopShift` moves player, camera, food and bubbles by W in one frame); every fish is kept within W/2 of the
focus (`keepNearFocus`); Brains aim at the nearest copy (`AIWorld.wrapNear`); `inKelp` folds x. Far parallax
layers use texture widths that make W x scrollFactor a whole number of tiles (no jump). Far fish think every third
frame (`LOD_DISTANCE`); far scenery is hidden (`cullStatics`). A region banner shows on entering. New runs start at
`world.startX`. Region gameplay twists come next (plan doc).

## Gates between regions (`src/systems/gates.ts` rules, `src/scenes/GateSystem.ts` art and play, `balance.json` "gates")
Each Tide opens the next region: Root Tangle (Coral Sea -> Swamp, x 12000, after the level 10 crab, bite it 5x with EAT),
Rock Fall (-> Volcanic Rift, x 19000, crab 20, ram 4x), two Ice Walls (-> Frozen Sea, x 28000 and 35900 at the loop's
seam, crab 30, ram 4x). A wall spans the whole water column, is solid for the player only (fish slip through), shows 3
crack stages, then breaks with bursts and a banner (`HudScene.bigBanner`). Too early: pushed back plus a "Beat the level N
Checkpoint Crab" popup. Rams count the speed aimed at the wall above `gates.ramSpeedRatio` x cruise (or a dash); the wall
bounces you back (`bounce`) so holding forward keeps ramming. Broken gates are saved (`Checkpoint.gatesOpen`), kept by
SWIM AGAIN (`nextGatesOpen`); saves from before gates keep the whole sea open (`openedFromSave`). Walls near the seam
get a copy past the edge. Tests that are not about gates call `gates.openAll()`. Leopard Seal unlocks at 31 and the
Giant Octopus at 21, when their regions open. E2E: `tests/e2e/gates.mjs`; unit: `tests/gates.test.ts`.

## Leaping and land (`GameScene` "Land" section, `balance.json` "land")
- Sprint upward through the surface to leap (`checkLeap`: sprinting, near the surface, rising faster than `jumpSpeed`). No extra button.
- `landState` is 'water', 'air' or 'land'. `updateOutOfWater` applies gravity, lands on islands via `landTopAt(x)` (follows the sand, mangrove and iceberg art), crawls and hops. `collideTerrain` skips the player out of the water.
- `updateDrying`: safe for `drySafeSeconds`, then `dryDamagePerSecond` of max HP. Death cause 'dried'. The HUD shows the countdown and a warning.
- E2E: `tests/e2e/land.mjs`.

## Enemy settings (`src/data/adminSettings.ts`, Options > Enemy settings)
Per enemy (species with a population): appears from level, how many, aggression, vision, top speed, health, bite,
fights-above-its-size. Saved on the device (`ce.admin.enemies`, only differences from shipped), clamped to safe
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

## Save slots
`SaveManager` keeps `SLOT_COUNT` (3) checkpoint slots; the game writes to `saves.activeSlot`. Slot 1 uses the
original key (`ce.save.checkpoint`), so older saves are slot 1; slots 2+ are `ce.save.checkpoint.N`, each with
its own `.bak`. Slot names and the active slot live in the profile (`profile.slots`). Home screen: Saved games
panel (Continue, New game, Rename, Delete with a confirm step); NEW RUN offers an empty slot first.
Switch slots only from the home screen, never mid-run.

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

## Region fish (`balance.json` "biomes", `pickHomeX` in `src/systems/regions.ts`)
Each species has a weight per region (0 = never there; missing = 1, read with `biomeWeight`). `spawnAmbientFish`
shares a species' fish out by weight x region width; each Creature gets `homeX(near?)`: Brains use it for wander
targets (stay within `roam` px while the region suits them and the spot does not cross into a region they like less,
otherwise head for a liked region) and `respawnAmbient` uses it too. Hunting and fleeing can still carry a fish
across a border; wandering brings it home. The weights are editable per enemy in Options > Enemy settings
("In Coral Sea", ...). E2E: `tests/e2e/creatures.mjs`; unit: `tests/creatures.test.ts`.

## Rams and bumps (`GameScene.updateRams`, rock collider)
A ram counts only the speed aimed into the target (`Fish.lastVx/lastVy` along the line to it), never a graze.
Ramming a fish stuns it and knocks it aside; it halves your speed only if it is clearly stronger
(`combat.ramSlowRankRatio`, 1.25x your rank). A rock stuns you only on a head-on hit. (Before Nov 23, brushing past
a same-size tang at normal speed halved your speed: the "small breaks" in swimming.)

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
