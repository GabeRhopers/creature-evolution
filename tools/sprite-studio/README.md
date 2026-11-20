# Sprite Studio

Single-file pixel sprite editor (`index.html`), published as a claude.ai artifact.

- Projects: fixed canvas (default 48x24), indexed palette (up to 62 colors), poses
  (idle, move, attack, damage, celebrate + custom), up to 5 frames per pose, fps per pose.
- Tools: pencil, eraser, fill, picker, line, rectangle (tap again for filled), replace color,
  select/move, pan; mirror drawing X/Y; onion skin; grid.
- Edit: copy/cut/paste (floating piece), copy/paste whole frames, flip, rotate, nudge,
  auto-outline, clear; undo/redo.
- Import a picture (white = transparent, palette matching); export sprite sheet PNG +
  Phaser-style JSON (with `meta.animations`), or the project file.
- Storage: artifact db `projects/<id>` (cloud), falling back to localStorage.

Project format (`croc-project.json`): `{name, w, h, palette:[hex], poses:[{name, fps,
frames:[string]}]}`; each frame string has one char per pixel, row by row:
`.` = transparent, `0-9A-Za-z` = palette index.
