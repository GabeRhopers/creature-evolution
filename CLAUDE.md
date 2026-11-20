# CLAUDE.md: rules for AI coding sessions on this repo

2D side-view fish survival and growth game (working title), inspired by the
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
- `src/ui/tuning.ts`: live slider panel (` key or TUNE button) for feel tuning.

## Rules
- **Art comes from the single atlas** (`ATLAS` in `src/assets.ts`):
  `scene.add.image(x, y, ATLAS, 'frame_name')`. Do not load loose PNGs at runtime.
  To add art: drop the PNG in `art/...`, run `npm run atlas`.
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
