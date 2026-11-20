# Fish Growth Game (working title)

A 2D side-view ocean survival game: start small, eat, grow, and become the
predator.

The mouth ring in front of your fish turns **green** when something you can
swallow whole is in reach and **orange** when it is too big: then EAT bites it,
tearing off meat chunks you can eat. Below 30% health you are **wounded**
(slow, tilted, and predators notice you from farther away): eat to heal.

**Stomach:** food gives about a third of its XP right away; the rest waits in
your stomach. Past 75% full, **stay still** for a moment to digest: the stored
food heals you first, then turns into XP. At 95% you cannot eat. If the stomach
empties completely you starve.

Bigger fish hunt you if they can swallow you whole. When "YOU ARE BEING HUNTED"
flashes, swim away or hide in kelp: fish inside kelp are invisible to predators
unless they get very close. Built with Phaser 4, TypeScript and Vite. All assets are free (CC0).

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
| Sprint | Shift (uses stamina) | SPRINT button, or a second finger |
| Eat: swallow (green ring) or bite (orange ring) | Space or right-click | EAT / BITE button |
| Dash: lunge, stun and damage what you hit | E or Q | DASH button |
| Eat plankton and meat chunks | just touch them with your mouth | same |
| Restart run | R | tap the death screen |
| Difficulty (restarts) | MODE button or `?difficulty=easy` / `hard` in the URL | MODE button |
| Dev: grow / shrink | G / H | DEV: GROW +1 button |
| Dev: tuning sliders | ` (backtick) | TUNE button |
| Dev: show hitboxes | P | |
| Fullscreen | F | |
| Sound on/off | SOUND button | SOUND button |

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
