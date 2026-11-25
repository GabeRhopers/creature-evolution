# App icons (home screen, Android launcher): Mike's crocodile (croc-adult idle pose) on a sea-blue tile.
# Writes public/icons/icon-{192,512}.png, maskable-512.png (extra margin for Android's round masks) and
# apple-touch-icon.png (180). Run:  python3 tools/icons/make_icons.py
import json, os
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '../../public/icons')
ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
p = json.load(open(os.path.join(HERE, '../../public/studio/seeds/croc-adult.json')))
w, h = p['w'], p['h']
f = next(x for x in p['poses'] if x['name'] == 'idle' and x['frames'])['frames'][0]
art = Image.new('RGBA', (w, h), (0, 0, 0, 0))
px = art.load()
for i, ch in enumerate(f):
    if ch != '.':
        c = p['palette'][ALPH.index(ch)]
        px[i % w, i // w] = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5)) + (255,)
art = art.crop(art.getbbox())


def tile(size, fill):
    """The croc centered on a vertical sea gradient, scaled by a whole number so pixels stay square."""
    im = Image.new('RGBA', (size, size))
    d = ImageDraw.Draw(im)
    top, bottom = (0x2c, 0xe8, 0xf5), (0x12, 0x4e, 0x89)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(top[k] * (1 - t) * 0.55 + bottom[k] * (0.45 + 0.55 * t)) for k in range(3)) + (255,))
    k = max(1, int(size * fill / art.width))
    a = art.resize((art.width * k, art.height * k), Image.NEAREST)
    im.alpha_composite(a, ((size - a.width) // 2, (size - a.height) // 2))
    return im


tile(192, 0.86).save(os.path.join(OUT, 'icon-192.png'))
tile(512, 0.86).save(os.path.join(OUT, 'icon-512.png'))
tile(512, 0.62).save(os.path.join(OUT, 'maskable-512.png'))   # Android crops to a circle: keep the croc in the middle
tile(180, 0.86).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
print('icons written')
