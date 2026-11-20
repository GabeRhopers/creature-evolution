"""
Player character: crocodile, redrawn from an original pixel-art design.
Each frame is a 48x16 grid (facing right). Run this script to regenerate
art/player/croc_*.png (3x nearest-neighbor upscale), then `npm run atlas`.

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

out = os.path.join(os.path.dirname(__file__), '..', 'art', 'player')
os.makedirs(out, exist_ok=True)
SCALE = 3
for name, rows in FRAMES.items():
    assert len(rows) == 16, (name, len(rows))
    for i, r in enumerate(rows):
        assert len(r) == 48, (name, i, len(r))
    im = Image.new('RGBA', (48, 16))
    for y, r in enumerate(rows):
        for x, k in enumerate(r):
            im.putpixel((x, y), PAL[k])
    im.resize((48 * SCALE, 16 * SCALE), Image.NEAREST).save(os.path.join(out, f'croc_{name}.png'))
print('ok', list(FRAMES))
