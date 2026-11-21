"""
Player character: crocodile, redrawn from an original pixel-art design.
Swim/bite/lurk frames are 48x16 grids (facing right), padded onto a 48x24
canvas so the idle pose (raised tail, drawn facing left like the original and
mirrored here) fits. All frames share the canvas so the body stays centered.
Run this script to regenerate art/player/croc_*.png (3x nearest-neighbor
upscale), then `npm run atlas`.

Palette keys:
  . transparent   K outline   D dark green   G green   L light green (scutes)
  B belly         Y eye       C teeth        R mouth   P tongue
"""
from PIL import Image
import os

PAL = {
    '.': (0, 0, 0, 0), 'K': (14, 26, 16, 255), 'D': (16, 94, 34, 255), 'G': (36, 142, 44, 255),
    'L': (104, 196, 82, 255), 'B': (170, 214, 120, 255), 'Y': (255, 226, 58, 255),
    'C': (247, 236, 200, 255), 'R': (178, 38, 43, 255), 'P': (232, 122, 122, 255),
}

FRAMES = {
'swim1': [
"................................................",
"..KK............................................",
".KLGK...........................................",
".KGLK.............................KKKKK.........",
"..KGLK...........................KYKKYK.........",
"..KDGLKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGKKKKKKK..",
"...KDGLGGLGGLGGLGGLGGLGGLGGLGGLGGGGGGGGGGGGGGGK.",
"....KDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
".....KDDGGGGGGGGGGGGGGGGGGGGGGGGGGGKCKCKCKCKCKCK",
"......KKDDGGGGGGGGGGGGGGGGGGGGGGGGGDGGGGGGGGGGGK",
"........KKDBBBBBBBBBBBBBBBBBBBBBBDKKKKKKKKKKKKK.",
"..........KKGGGKKKKKKKKKKKGGGKKKK...............",
".........KGGGK..........KGGGK...................",
"........KGGKK...........KGGK....................",
"........KKKK...........KKKK.....................",
"................................................",
],
'swim2': [
"................................................",
"................................................",
"..KK............................................",
".KLGK.............................KKKKK.........",
".KGLKK...........................KYKKYK.........",
"..KDGLKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGKKKKKKK..",
"...KDGLGGLGGLGGLGGLGGLGGLGGLGGLGGGGGGGGGGGGGGGK.",
"....KDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
".....KDDGGGGGGGGGGGGGGGGGGGGGGGGGGGKCKCKCKCKCKCK",
"......KKDDGGGGGGGGGGGGGGGGGGGGGGGGGDGGGGGGGGGGGK",
"........KKDBBBBBBBBBBBBBBBBBBBBBBDKKKKKKKKKKKKK.",
"..........KKGGKKKKKKKKKKKKGGKKKKK...............",
"............KGGGK..........KGGGK................",
".............KGGK...........KGGK................",
".............KKKK...........KKKK................",
"................................................",
],
'bite': [
"..........................................KK....",
"..KK....................................KKGGK...",
".KLGK...........................KKKKK.KKGGGCK...",
".KGLK..........................KYKKYKKGGGGCK....",
"..KGLK.........................KGGGGGGGGGCK.....",
"..KDGLKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGGGGCK......",
"...KDGLGGLGGLGGLGGLGGLGGLGGLGGLGGGGGGGRRK.......",
"....KDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRRRPRK......",
".....KDDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGRRPPRRK....",
"......KKDDGGGGGGGGGGGGGGGGGGGGGGGGGDGGKCKCKCKCKK",
"........KKDBBBBBBBBBBBBBBBBBBBBBBDGGGGGGGGGGGGGK",
"..........KKGGGKKKKKKKKKKKGGGKKKKKKKKKKKKKKKKKK.",
".........KGGGK..........KGGGK...................",
"........KGGKK...........KGGK....................",
"........KKKK...........KKKK.....................",
"................................................",
],
'lurk': [
"................................................",
"................................................",
"................................................",
"................................................",
"................................................",
"................................................",
"................................................",
"..................................KKKKK.........",
".................................KYKKYK.........",
"KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGKKKKKKKK.",
"KLGGLGGLGGLGGLGGLGGLGGLGGLGGLGGLGGGGGGGGGGGGGGGK",
"KKDDGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKCKCKCKCKCKCKCK",
".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
"................................................",
"................................................",
"................................................",
],
}


# Idle pose: from the son's second drawing (tail straight up, jaw slightly open,
# teeth and red tongue showing). Drawn FACING LEFT like the original, 34 wide.
IDLE_LEFT = [
"..................................",
"..............................KK..",
".............................KLGK.",
".............................KLGK.",
".............................KGGK.",
".............................KLGK.",
"............................KLGGK.",
"............................KGGDK.",
"...........................KLGGDK.",
"..........KKK.............KLGGDK..",
".......KKKYKYKKKKKKKKKKKKKLGGGDK..",
"..KKKKKGGGGGGGLGGLGGLGGLGGLGGGDK..",
".KGGGGGGGGGGGGGGGGGGGGGGGGGGGGDK..",
".KKKKKKKKKKKGGGGGGGGGGGGGGGGGGDK..",
"..C.C..C.RRKGGGGGGGGGGGGGGGGGGDK..",
".KC.C..C.RKGGGGBBBBBBBBBBBBGGGDK..",
".KGGGGGGGGGGGGDBBBBBBBBBBBBGGGDK..",
"..KKKKKKKKKGGGDKKKKKKKKKKKKGGGDK..",
"..........KGGDK...........KGGDK...",
".........KGGGK...........KGGGK....",
".........KKKK............KKKK.....",
]

def idle_variant(tail_shift=0, tongue=False, blink=False):
    rows = [list(r) for r in IDLE_LEFT]
    if tail_shift:
        # Sway the top of the tail: tip moves 2px, the part below 1px.
        for y in range(1, 7):
            n = 2 if y <= 3 else 1
            r = rows[y]
            rows[y] = (['.'] * n + r[:-n]) if tail_shift > 0 else (r[n:] + ['.'] * n)
    if tongue:
        # Tongue flicks forward between the teeth.
        rows[14][8] = 'P'
        rows[15][8] = 'R'
    if blink:
        rows[10][10] = 'K'
        rows[10][12] = 'K'
    # Mirror to face right, then place on the 48x24 canvas.
    flipped = [''.join(reversed(r)) for r in rows]
    canvas = []
    for y in range(24):
        src = y - 0
        line = flipped[src] if 0 <= src < len(flipped) else '.' * 34
        # Snout at the same column as the swim frames, so the mouth ring lines up.
        canvas.append('.' * 14 + line)
    return canvas

def pad16(rows):
    """Put a 48x16 frame on the 48x24 canvas (3 rows above, 5 below)."""
    return ['.' * 48] * 3 + rows + ['.' * 48] * 5

for k in list(FRAMES):
    FRAMES[k] = pad16(FRAMES[k])
FRAMES['idle1'] = idle_variant()
FRAMES['idle2'] = idle_variant(tail_shift=1, tongue=True)
FRAMES['idle_blink'] = idle_variant(blink=True)

out = os.path.join(os.path.dirname(__file__), '..', 'art', 'player')
os.makedirs(out, exist_ok=True)
SCALE = 3
for name, rows in FRAMES.items():
    assert len(rows) == 24, (name, len(rows))
    for i, r in enumerate(rows):
        assert len(r) == 48, (name, i, len(r))
    im = Image.new('RGBA', (48, 24))
    for y, r in enumerate(rows):
        for x, k in enumerate(r):
            im.putpixel((x, y), PAL[k])
    im.resize((48 * SCALE, 24 * SCALE), Image.NEAREST).save(os.path.join(out, f'croc_{name}.png'))
print('ok', list(FRAMES))
