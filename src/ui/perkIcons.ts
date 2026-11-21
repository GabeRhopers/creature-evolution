// 16x16 pixel-art perk icons (instead of emoji), drawn from text grids in the
// Endesga 32 palette. Used by the HUD (as textures) and the perk picker (as images).

const PAL: Record<string, string> = {
  K: '#181425', // outline
  W: '#ffffff',
  g: '#c0cbdc',
  c: '#ead4aa',
  B: '#0099db',
  b: '#124e89',
  C: '#2ce8f5',
  Y: '#fee761',
  O: '#feae34',
  R: '#e43b44',
  r: '#a22633',
  P: '#f6757a',
};

/** One grid per perk id: 16 rows of 16 cells ('.' = empty). */
export const PERK_ICONS: Record<string, string[]> = {
  // Swift Tail: speed streaks.
  swift: [
    '................',
    '................',
    '...KKKKKKKK.....',
    '...KWWWWWWWK....',
    '...KKKKKKKK.....',
    '................',
    '.KKKKKKKKKKKK...',
    '.KCCCCCCCCCCCK..',
    '.KKKKKKKKKKKK...',
    '................',
    '....KKKKKKKKK...',
    '....KBBBBBBBBK..',
    '....KKKKKKKKK...',
    '................',
    '................',
    '................',
  ],
  // Thick Hide: a shield.
  hide: [
    '................',
    '..KKKKKKKKKKKK..',
    '..KWWBBBBBBbbK..',
    '..KWBBBBBBBbbK..',
    '..KWBBBBBBBbbK..',
    '..KBBBBBBBBbbK..',
    '..KBBBBBBBBbbK..',
    '..KBBBBBBBBbbK..',
    '...KBBBBBBbbK...',
    '...KBBBBBBbbK...',
    '....KBBBBbbK....',
    '....KBBBBbbK....',
    '.....KBBbbK.....',
    '......KBbK......',
    '.......KK.......',
    '................',
  ],
  // Strong Jaws: a tooth.
  jaws: [
    '................',
    '...KKKKKKKKKK...',
    '..KWWWWWWWWccK..',
    '..KWWWWWWWWWcK..',
    '..KWWWWWWWWWcK..',
    '..KWWWWWWWWWcK..',
    '..KWWWWWWWWWcK..',
    '...KWWWWWWWcK...',
    '...KWWWKKWWcK...',
    '...KWWK..KWcK...',
    '...KWWK..KWcK...',
    '...KWWK..KWcK...',
    '...KWK....KcK...',
    '....KK.....KK...',
    '................',
    '................',
  ],
  // Big Belly: a meat chunk on the bone.
  belly: [
    '................',
    '.....KKKKK......',
    '...KKRRRRRKK....',
    '..KRRPPRRRRRK...',
    '..KRPPRRRRRrK...',
    '.KRRPRRRRRRrrK..',
    '.KRRRRRRRRRrrK..',
    '.KRRRRRRRRrrK...',
    '..KRRRRRRrrK....',
    '..KKrrrrrrKK....',
    '....KKKKKKWK....',
    '.........KWWK...',
    '........KWWgWK..',
    '........KWgWWK..',
    '.........KKKK...',
    '................',
  ],
  // Quick Recovery: a lightning bolt.
  focus: [
    '................',
    '........KKKKK...',
    '.......KYYYYK...',
    '......KYYYOK....',
    '.....KYYYOK.....',
    '....KYYYOK......',
    '...KYYYYKKKKK...',
    '..KYYYYYYYYYK...',
    '..KKKKKYYYOK....',
    '.....KYYYOK.....',
    '....KYYYOK......',
    '...KYYOK........',
    '..KYYOK.........',
    '..KYOK..........',
    '..KKK...........',
    '................',
  ],
};

/** A perk icon drawn at `scale` (whole pixels), or null for an unknown perk. */
export function perkIconCanvas(id: string, scale = 1): HTMLCanvasElement | null {
  const grid = PERK_ICONS[id];
  if (!grid) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 16 * scale;
  const g = c.getContext('2d')!;
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const col = PAL[ch];
      if (!col) return;
      g.fillStyle = col;
      g.fillRect(x * scale, y * scale, scale, scale);
    }),
  );
  return c;
}

/** The icon as an image URL (for HTML), or '' for an unknown perk. */
export function perkIconUrl(id: string, scale = 2): string {
  try {
    return perkIconCanvas(id, scale)?.toDataURL() ?? '';
  } catch {
    return '';
  }
}

export const PERK_ICON_COLORS = PAL;
