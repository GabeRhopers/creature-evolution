// Small pixel-art textures made in code (bubbles, food dots, meat chunks).
//
// One texture pixel per art pixel, rendered with Phaser's smooth pixel art
// (blocky pixels with clean edges at any scale), so effects match the pixel
// look of the creatures. Drawn in white and tinted at use.
import type Phaser from 'phaser';

export const PX = 'px';

/** Art for each frame: '#' = solid, '+' = 55% (soft shade), '.' = empty. */
const FRAMES: Record<string, string[]> = {
  // A bubble: ring with a highlight pixel.
  bubble: ['.##.', '#+.#', '#..#', '.##.'],
  bubble6: ['..##..', '.#..#.', '#.+..#', '#....#', '.#..#.', '..##..'],
  // Plankton: a round 4x4 dot.
  dot: ['.##.', '####', '####', '.##.'],
  // Meat chunk: an irregular lump.
  chunk: ['.##.', '###+', '####', '.+#.'],
};

/** On-screen width each frame replaces (the old atlas art was 24 px wide in its 128 px frame). */
export const PX_FRAME_WIDTH: Record<string, number> = { bubble: 4, bubble6: 6, dot: 4, chunk: 4 };

export function createPixelTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(PX)) return;
  const names = Object.keys(FRAMES);
  const pad = 1;
  const w = names.reduce((s, n) => s + FRAMES[n][0].length + pad, 0);
  const h = Math.max(...names.map((n) => FRAMES[n].length));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  const pos: Record<string, number> = {};
  let x = 0;
  for (const n of names) {
    pos[n] = x;
    FRAMES[n].forEach((row, y) =>
      [...row].forEach((c, i) => {
        if (c === '.') return;
        g.fillStyle = c === '+' ? 'rgba(255,255,255,0.55)' : '#ffffff';
        g.fillRect(x + i, y, 1, 1);
      }),
    );
    x += FRAMES[n][0].length + pad;
  }
  const tex = scene.textures.addCanvas(PX, canvas)!;
  for (const n of names) tex.add(n, 0, pos[n], 0, FRAMES[n][0].length, FRAMES[n].length);
  tex.setSmoothPixelArt(true);
}
