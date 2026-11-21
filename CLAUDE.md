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
- `src/scenes/`: Boot (loads atlas), Game (world + entities), Hud (screen overlay).
- `src/entities/Food.ts`: plankton field kept around the camera (pooled images).
- Eating lives in `GameScene.updateEating()`: mouth = circle ahead of the head
  (`Fish.mouthPoint/mouthRadius`); swallow allowed if `target.size <= devourSize`.
- `src/systems/Stomach.ts`: pure stomach/digestion logic; GameScene applies releases (heal first, then XP).
- `src/audio/Sfx.ts`: all sound effects synthesized with Web Audio (no files). Music: `public/assets/audio/`.
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
  (bubbles, food) come from `src/systems/pixelTextures.ts`. The world (water bands, sand, rocks, kelp,
  light rays, far silhouettes) is generated in `src/systems/worldTextures.ts` and drawn at
  `WORLD_PX` = 4 world px per art px; rock collision circles and kelp zones keep their old sizes. Camera zoom changes only per stage.
  Reef fish looks are Sprite Studio starter designs (`public/studio/seeds/fish-*.json`, drawn by
  `tools/fish/draw_fish.py`), linked by `look` in species.json, loaded by Boot, built once per scene.
  Target pixel density: about 3.5 world pixels per art pixel (size / bodyRadius).
  Interface: labels, numbers and banners use the pixel font Pixelify Sans (`--font-display`, HUD `FONT`);
  longer help text stays in the plain body font. Perk icons are 16x16 pixel grids in `src/ui/perkIcons.ts`
  (no emoji). The home logo animates the picked hero's adult design.
- **No Phaser ParticleEmitter for now**; use the pooled `Bubbles` helper or
  similar plain-image pools.
- Use Arcade Physics with **circle bodies only** (fish rotate; circles do not care).
- Keep it touch-first: every action needs a touch path (button or gesture).
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
