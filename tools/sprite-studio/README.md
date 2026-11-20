# Sprite Studio

The studio now ships inside the game: `public/studio/index.html`, served at
`studio/index.html` in the same artifact. Sharing the page's origin and cloud
database lets the game read studio projects directly.

- **Try in game** (studio top bar) saves, then opens `../index.html?try=<project>&pose=<n>`:
  a test swim with that drawing. Nothing is saved or recorded, and the real run is untouched.
- **Back to studio** returns to the same project and pose (`studio/index.html?project=<id>&pose=<n>`).
- **Options > Your crocodile** in the game picks the look for real runs (`profile.settings.skin`).
- Pose mapping lives in `src/skins.ts`: idle, move (swim), attack (bite), rest (digest),
  damage (hit flash) and celebrate (level-up).

`croc-project.json` is the seed crocodile project (the son's original idle pose).
The old standalone studio artifact now shows a "moved" note.
