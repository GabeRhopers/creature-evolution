# Shared helpers for the playable heroes' stage designs (Mosa, White Shark).
#
# Drawings are lists of character rows, facing right:
#   '.' empty   K outline   Y eye   B closed eye   T tooth   E inside of the mouth   F water splash
#   S eggshell  s eggshell shade   c eggshell crack
# Each hero script adds its own body characters and maps every character to a palette index.
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'stages'))
from render import frame_img  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

FW = json.load(open(os.path.join(HERE, '../../public/studio/frameworks.json')))
MARGIN = FW['default']['margin']
STAMP = '2026-11-21T12:00:00.000Z'   # a known starter-design timestamp (see SEED_STAMPS)

# Endesga 32 colors shared by every hero
OUTLINE, EYE, MOUTH, SPLASH = '#181425', '#fee761', '#3e2731', '#c0cbdc'
SHELL, SHELL_SHADE, SHELL_CRACK = '#ffffff', '#c0cbdc', '#8b9bb4'
SHELL_CHARS = 'Ssc'


def grid(rows):
    return [list(r) for r in rows]


def trim(rows):
    ys = [y for y, r in enumerate(rows) if ''.join(r).strip('.')]
    rows = rows[ys[0]:ys[-1] + 1]
    xs = [x for x in range(len(rows[0])) if any(r[x] != '.' for r in rows)]
    return [list(r[xs[0]:xs[-1] + 1]) for r in rows]


def eye(rows):
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in 'YB': return x, y
    raise ValueError('no eye')


def teeth_row(rows):
    return next(y for y, r in enumerate(rows) if 'T' in r)


def pad(rows, top=0, bottom=0, left=0, right=0):
    w = len(rows[0]) + left + right
    out = [['.'] * w for _ in range(top)]
    out += [['.'] * left + r[:] + ['.'] * right for r in rows]
    out += [['.'] * w for _ in range(bottom)]
    return out


def outline_around(rows, chars):
    """Outline (K) every empty cell that touches one of `chars`."""
    H, W = len(rows), len(rows[0])
    add = [(x, y) for y in range(H) for x in range(W) if rows[y][x] == '.' and any(
        0 <= x + dx < W and 0 <= y + dy < H and rows[y + dy][x + dx] in chars
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    for x, y in add: rows[y][x] = 'K'
    return rows


def blink(rows):
    """'B' = a closed eye: drawn as outline, but it still marks where the eye is."""
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
        for y in range(t + 1, len(rows)): rows[y][x] = '.'
        for y in range(t + 1, len(rows) - drop):
            if old[y][x] != '.': rows[y + drop][x] = old[y][x]
        for y in range(t + 1, t + 1 + drop): rows[y][x] = 'E'
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


def egg(rows, cx, cy, rx, ry, cap=True, edge=False, cap_w=7):
    """The hatchling's egg, like the crocodile's: it sits in the bottom half of a broken shell
    (jagged top edge, shaded bottom, two cracks) and wears a piece of shell on its head as a cap.
    cx, cy, rx, ry: the shell ellipse in the drawing's own pixels. edge=True draws the jagged rim
    in outline color, for light bodies the white shell would blend into."""
    m = int(ry) + 4
    rows = pad(rows, top=4, bottom=m, left=m, right=m)
    cx, cy = cx + m, cy + 4
    H, W = len(rows), len(rows[0])
    top = cy - round(ry * 0.4)
    jag = lambda x: top + (0, 1, 2)[x % 3]
    inside = lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0
    for y in range(H):
        for x in range(W):
            if not inside(x, y) or y < jag(x): continue
            low = y >= cy + ry * 0.5 and ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.55
            rows[y][x] = 's' if low else 'S'
            if edge and y == jag(x): rows[y][x] = 'K'
    # two cracks, one on each side
    for (dx, dy) in ((-0.6, 0.1), (-0.55, 0.3), (0.55, 0.05), (0.6, 0.25)):
        x, y = round(cx + dx * rx), round(cy + dy * ry)
        if rows[y][x] in 'Ss': rows[y][x] = 'c'
    if cap:
        ex, ey = eye(rows)
        head_top = min(y for y in range(H) if rows[y][ex] != '.')
        # cap_w wide: a rounded top row, a full row, then a jagged broken edge
        y0 = head_top - 3
        x0 = ex - cap_w // 2
        last = x0 + cap_w - 1
        for x in range(x0 + 1, last): rows[y0][x] = 'S'
        for x in range(x0, last + 1): rows[y0 + 1][x] = 's' if x == last else 'S'
        for x in range(x0, last + 1, 2): rows[y0 + 2][x] = 's' if x == last else 'S'
    return trim(outline_around(rows, SHELL_CHARS))


def place(rows, eye_at, cw, ch, code):
    """Put a drawing on the canvas so its eye lands on `eye_at` (keeps the head and mouth still between frames)."""
    ex, ey = eye(rows)
    ox, oy = eye_at[0] - ex, eye_at[1] - ey
    g = [['.'] * cw for _ in range(ch)]
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '.': continue
            X, Y = x + ox, y + oy
            if not (MARGIN <= X < cw - MARGIN and MARGIN <= Y < ch - MARGIN):
                raise SystemExit(f'pixel {X},{Y} lands in the margin (eye at {eye_at})')
            g[Y][X] = c
    return ''.join(code[c] for r in g for c in r)


def project(name, framework, palette, code, eye_at, mouth, radius, poses, version=3):
    cw, ch = FW[framework]['canvas']
    return {'name': name, 'w': cw, 'h': ch, 'palette': palette, 'framework': framework,
            'bodyRadius': radius, 'mouth': mouth, 'pixelScale': 3,
            'poses': [{'name': n, 'fps': f, 'frames': [place(r, eye_at, cw, ch, code) for r in fr]} for n, f, fr in poses],
            'updatedAt': STAMP, 'seedVersion': version}


def preview(projects, path):
    """Every frame of every project, with the framework guides (margin, body circle, mouth)."""
    def guides(p, s, k=6):
        im = frame_img(p, s, k=k)
        dr = ImageDraw.Draw(im)
        cw, ch = p['w'], p['h']
        dr.rectangle([MARGIN * k, MARGIN * k, (cw - MARGIN) * k - 1, (ch - MARGIN) * k - 1], outline=(255, 120, 120))
        cx, cy, r = cw / 2 * k, ch / 2 * k, p['bodyRadius'] * k
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255))
        mx, my = (p['mouth'][0] + .5) * k, (p['mouth'][1] + .5) * k
        dr.ellipse([mx - 6, my - 6, mx + 6, my + 6], outline=(255, 200, 0), width=2)
        return im
    rows = [[guides(p, f) for po in p['poses'] for f in po['frames']] for p in projects]
    Wd = max(sum(i.width + 8 for i in r) for r in rows)
    Hd = sum(r[0].height + 8 for r in rows)
    sheet = Image.new('RGB', (Wd, Hd), (10, 20, 30))
    y = 0
    for r in rows:
        x = 0
        for i in r:
            sheet.paste(i, (x, y)); x += i.width + 8
        y += r[0].height + 8
    sheet.save(path)
