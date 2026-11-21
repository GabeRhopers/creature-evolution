# Mosa: the second playable hero, from Mike's drawings.
#
#   reference-base.jpg   one Mosa, 32 x 10 pixels (faces left)  -> juvenile, and the hatchling made from it
#   reference-poses.jpg  five swim poses, about 48 x 20 pixels  -> adult
#
# The drawings were sampled cell by cell into base_grid.txt and strip_grid.txt
# (K outline, d dark teal, l light teal, Y eye, T teeth). This script turns them into
# three Sprite Studio starter designs on the "mosa" framework (64 x 48 canvas).
# Run from this folder:  python3 draw_mosa.py   -> mosa-*.json + mosa_preview.png
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'stages'))
from render import frame_img
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
FW = json.load(open(os.path.join(HERE, '../../public/studio/frameworks.json')))
CW, CH = FW['mosa']['canvas']
MARGIN = FW['default']['margin']
STAMP = '2026-11-21T12:00:00.000Z'   # a known starter-design timestamp (see SEED_STAMPS)

# Palette: Endesga 32 outline, eye and mouth, plus Mosa's 3 signature colors from the drawing.
PAL = ['#181425',  # 0 K outline
       '#429698',  # 1 d dark teal   (signature)
       '#58c2c2',  # 2 l light teal  (signature)
       '#fee761',  # 3 Y eye
       '#fefeb4',  # 4 T teeth       (signature)
       '#3e2731',  # 5 E inside of the mouth
       '#c0cbdc']  # 6 F water splash
CODE = {'B': '0', 'K': '0', 'd': '1', 'l': '2', 'Y': '3', 'T': '4', 'E': '5', 'F': '6', '.': '.'}
SIGNATURE = ['#429698', '#58c2c2', '#fefeb4']


def trim(rows):
    ys = [y for y, r in enumerate(rows) if r.strip('.')]
    rows = rows[ys[0]:ys[-1] + 1]
    xs = [x for x in range(len(rows[0])) if any(r[x] != '.' for r in rows)]
    return [list(r[xs[0]:xs[-1] + 1]) for r in rows]


def eye(rows):
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in 'YB': return x, y
    raise ValueError('no eye')


def clean_teeth(rows):
    """The teeth row alternates tooth / gap from the snout tip, like the drawing (JPEG noise removed)."""
    for y, r in enumerate(rows):
        if 'T' not in r: continue
        first = r.index('T') - 1
        last = max(x for x, c in enumerate(r) if c != '.')
        for x in range(first, last + 1):
            r[x] = 'K' if (last - x) % 2 == 0 else 'T'
        r[last] = 'K'
        break
    return rows


def teeth_row(rows):
    return next(y for y, r in enumerate(rows) if 'T' in r)


# ---------------------------------------------------------------- source drawings
STRIP = open(os.path.join(HERE, 'strip_grid.txt')).read().split('\n')
POSES = [clean_teeth(trim([r[a:b] for r in STRIP]))
         for a, b in ((2, 50), (52, 97), (99, 144), (146, 187), (187, 238))]
BASE = [list(r[::-1]) for r in trim(open(os.path.join(HERE, 'base_grid.txt')).read().split('\n'))]  # face right


def blink(rows):
    # 'B' = a closed eye: drawn as outline, but still marks where the eye is
    return [['B' if c == 'Y' else c for c in r] for r in rows]


def open_jaw(rows, amount, splash=False):
    """Bite: the lower jaw drops `amount` pixels at the tip (less toward the hinge); the gap is the dark mouth."""
    rows = [r[:] for r in rows] + [['.'] * len(rows[0]) for _ in range(amount + 1)]
    t = teeth_row(rows)
    ex, _ = eye(rows)
    tip = max(x for x, c in enumerate(rows[t]) if c != '.')
    hinge = ex + 1
    old = [r[:] for r in rows]
    for x in range(hinge, tip + 1):
        drop = round(amount * (x - hinge + 1) / (tip - hinge + 1))
        if drop <= 0: continue
        for y in range(t + 1, len(rows)):
            rows[y][x] = '.'
        for y in range(t + 1, len(rows) - drop):
            if old[y][x] != '.': rows[y + drop][x] = old[y][x]
        for y in range(t + 1, t + 1 + drop):
            rows[y][x] = 'E'
        # lower teeth on the dropped jaw, opposite the upper ones
        if x < tip and rows[t + 1 + drop][x] != '.':
            rows[t + 1 + drop][x] = 'T' if (tip - x) % 2 == 1 else 'K'
    if splash:
        for dx, dy in ((2, -2), (3, 0), (2, 2)):
            x, y = tip + dx, t + dy
            if 0 <= y < len(rows):
                if x >= len(rows[y]):
                    for r in rows: r.extend(['.'] * (x - len(r) + 1))
                rows[y][x] = 'F'
    return rows


def legs(rows, step):
    """Walk/paddle: front and back legs (the rows under the body) shift opposite ways by one pixel."""
    rows = [r[:] for r in rows]
    t = teeth_row(rows)
    bottom = [y for y in range(len(rows)) if y > t + 1]
    W = len(rows[0])
    mid = W // 2
    for y in bottom:
        r = rows[y]
        back, front = r[:mid], r[mid:]
        back = (back[1:] + ['.']) if step > 0 else (['.'] + back[:-1])
        front = (['.'] + front[:-1]) if step > 0 else (front[1:] + ['.'])
        rows[y] = back + front
    return rows


def tail_flick(rows):
    """Tail tip one pixel higher (the two leftmost columns rise)."""
    rows = [r[:] for r in rows]
    for x in range(0, 3):
        col = [rows[y][x] for y in range(len(rows))]
        col = col[1:] + ['.']
        for y in range(len(rows)): rows[y][x] = col[y]
    return rows


def shrink(rows, drop_cols):
    """Hatchling: the juvenile with some repeated snout, body and tail columns removed."""
    return [[c for x, c in enumerate(r) if x not in drop_cols] for r in rows]


# ---------------------------------------------------------------- placement on the framework
def place(rows, eye_at):
    """Put a drawing on the canvas so its eye lands on `eye_at` (keeps the head and mouth still between frames)."""
    ex, ey = eye(rows)
    ox, oy = eye_at[0] - ex, eye_at[1] - ey
    g = [['.'] * CW for _ in range(CH)]
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '.': continue
            X, Y = x + ox, y + oy
            if not (MARGIN <= X < CW - MARGIN and MARGIN <= Y < CH - MARGIN):
                raise SystemExit(f'pixel {X},{Y} lands in the margin (eye at {eye_at})')
            g[Y][X] = c
    return ''.join(CODE[c] for r in g for c in r)


def project(name, eye_at, mouth, radius, poses):
    return {'name': name, 'w': CW, 'h': CH, 'palette': PAL, 'framework': 'mosa',
            'bodyRadius': radius, 'mouth': mouth, 'pixelScale': 3,
            'poses': [{'name': n, 'fps': f, 'frames': [place(r, eye_at) for r in fr]} for n, f, fr in poses],
            'updatedAt': STAMP, 'seedVersion': 3}


P1, P2, P3, P4, P5 = POSES
JUV = BASE
# hatchling: drop 2 snout, 2 body (between the legs) and 2 tail columns (all plain repeats in the drawing)
HATCH = shrink(JUV, {1, 3, 12, 13, 25, 27})

out = {
    'mosa-hatchling': project('Mosa 1: Hatchling', (40, 22), [47, 23], 4, [
        ('idle', 3, [HATCH, tail_flick(HATCH), blink(HATCH)]),
        ('move', 6, [legs(HATCH, 1), legs(HATCH, -1)]),
        ('attack', 10, [open_jaw(HATCH, 1), open_jaw(HATCH, 2), HATCH]),
        ('damage', 6, []), ('celebrate', 6, [tail_flick(HATCH), HATCH]), ('rest', 2, [blink(HATCH)])]),
    'mosa-juvenile': project('Mosa 2: Juvenile', (42, 22), [51, 23], 5, [
        ('idle', 3, [JUV, tail_flick(JUV), blink(JUV)]),
        ('move', 6, [legs(JUV, 1), legs(JUV, -1)]),
        ('attack', 10, [open_jaw(JUV, 1), open_jaw(JUV, 2), open_jaw(JUV, 0, splash=True), JUV]),
        ('damage', 6, []), ('celebrate', 6, [tail_flick(JUV), JUV]), ('rest', 2, [blink(JUV)])]),
    'mosa-adult': project('Mosa 3: Adult', (44, 20), [57, 22], 8, [
        ('idle', 3, [P1, P1, blink(P1)]),
        ('move', 5, [P5, P3, P5, P4]),
        ('attack', 10, [open_jaw(P5, 2), open_jaw(P5, 3), open_jaw(P5, 0, splash=True), P5]),
        ('damage', 6, []), ('celebrate', 5, [P2, P3]), ('rest', 2, [blink(P5)])]),
}

for pid, p in out.items():
    json.dump(p, open(os.path.join(HERE, pid + '.json'), 'w'))


# ---------------------------------------------------------------- preview sheet with the framework guides
def guides(p, s, k=6):
    im = frame_img(p, s, k=k)
    dr = ImageDraw.Draw(im)
    dr.rectangle([MARGIN * k, MARGIN * k, (CW - MARGIN) * k - 1, (CH - MARGIN) * k - 1], outline=(255, 120, 120))
    cx, cy, r = CW / 2 * k, CH / 2 * k, p['bodyRadius'] * k
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255))
    mx, my = (p['mouth'][0] + .5) * k, (p['mouth'][1] + .5) * k
    dr.ellipse([mx - 6, my - 6, mx + 6, my + 6], outline=(255, 200, 0), width=2)
    return im


rows = [[guides(p, f) for po in p['poses'] for f in po['frames']] for p in out.values()]
Wd = max(sum(i.width + 8 for i in r) for r in rows)
Hd = sum(r[0].height + 8 for r in rows)
sheet = Image.new('RGB', (Wd, Hd), (10, 20, 30))
y = 0
for r in rows:
    x = 0
    for i in r:
        sheet.paste(i, (x, y)); x += i.width + 8
    y += r[0].height + 8
sheet.save(os.path.join(HERE, 'mosa_preview.png'))
print('ok')
