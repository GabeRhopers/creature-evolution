# Fish Growth Game (working title)

A 2D side-view ocean survival game: start small, eat, grow, and become the
predator. Built with Phaser 4, TypeScript and Vite. All assets are free (CC0).

## Play / develop

```bash
npm install
npm run dev      # open the printed URL (use the Network URL to test on an iPad on the same Wi-Fi)
npm run build    # production build in dist/ (upload the folder contents to itch.io as a ZIP)
```

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Swim | WASD or arrow keys, or hold the mouse button | Hold a finger where you want to go (farther = faster) |
| Sprint | Shift or Space (uses stamina) | SPRINT button, or a second finger |
| Dev: grow / shrink | G / H | GROW +1 button |
| Dev: tuning sliders | ` (backtick) | TUNE button |
| Dev: show hitboxes | P | |
| Fullscreen | F | |

Add `?canvas` to the URL to force the Canvas renderer if a device has WebGL issues.

## Project layout

```
art/kenney-fish-pack/   source PNGs (CC0), packed by scripts/build-atlas.mjs
public/assets/          generated atlas.png + atlas.json
src/data/               species.json, balance.json, difficulty.json (all tuning)
src/entities/           Fish, PlayerController, WanderBrain
src/systems/            growth formulas, bubbles
src/scenes/             Boot, Game, Hud
src/ui/                 live tuning panel
```

See `CLAUDE.md` for architecture rules and the sprint roadmap.
