/**
 * All art comes from ONE texture atlas, built by `npm run atlas` from the PNGs
 * in art/kenney-fish-pack/ (frame name = PNG file name without .png).
 * Draw any sprite with `scene.add.image(x, y, ATLAS, 'frame_name')`.
 * One texture = one GPU batch: faster on mobile, and it avoids texture
 * switching artifacts we saw with many separate PNGs.
 */
export const ATLAS = 'kenney';
