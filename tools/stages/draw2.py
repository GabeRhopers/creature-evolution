# Crocodile stages on the crocodile sprite framework (64x56 canvas, body center = canvas center).
import json, sys
sys.path.insert(0, '.')
import draw as d1
from render import frame_img
from PIL import Image

FW = json.load(open('/home/claude/fishgame/public/studio/frameworks.json'))
CW, CH = FW['crocodile']['canvas']
MARGIN = FW['default']['margin']
PAL = d1.PAL + ['#3e2731', '#c0cbdc']   # E: inside of the mouth, F: water splash

def blank(): return [['.'] * CW for _ in range(CH)]
def to_str(g): return ''.join(''.join(r) for r in g)
def place(src48, ox, oy):
    g = blank()
    for i, c in enumerate(src48):
        if c == '.': continue
        x, y = i % 48 + ox, i // 48 + oy
        g[y][x] = c
    return g
def check_margin(g, name):
    for y in range(CH):
        for x in range(CW):
            if g[y][x] != '.' and (x < MARGIN or y < MARGIN or x >= CW - MARGIN or y >= CH - MARGIN):
                raise SystemExit(f'{name}: pixel at {x},{y} is inside the margin')

# ---- hatchling and juvenile: the 48x24 designs, re-centered
def hatch(**k): return place(d1.hatchling(**k), 16, 13)
def juv(**k): return place(d1.juvenile(**k), 16, 16)

# ---- adult: inspired by the reference drawing (sampled grid, mirrored to face right, doubled, refined)
REF = open('ref_grid.txt').read().split('\n')
REF = [r[::-1] for r in REF]                         # face right
# the reference's 2-tone dark red tongue: '8' -> '7'
REF = [r.replace('8', '7') for r in REF]
# drop one repeated body column so the doubled drawing fits inside the margins (31 -> 30 columns)
def drop_col(rows, c): return [r[:c] + r[c + 1:] for r in rows]
# close the open mouth with a dark inside, so water does not show between the jaws
_r = [list(r) for r in REF]
for y, xs in ((14, (23, 25, 26, 27, 29)), (15, (27, 28, 29, 30)), (16, (29,))):
    for x in xs:
        if _r[y][x] == '.': _r[y][x] = 'E'
REF = [''.join(r) for r in _r]

SPLASH = 'F'   # palette 15: light water splash

def bite_pose(rows, phase):
    """Bite sequence inspired by the reference: 1 open wide, 2 wider, 3 snap shut with a splash, 4 recover."""
    H = len(rows)
    rows = [r + ['.'] * 3 for r in rows] + [['.'] * (len(rows[0]) + 3) for _ in range(2)]
    if phase in (1, 2):
        amp = 2 if phase == 1 else 3
        old = [r[:] for r in rows]
        for c in range(23, 31):
            # a V shape: the jaws open more toward the tip than at the hinge
            up = round(amp * (c - 22) / 8)
            down = round(amp * (c - 22) / 8 * 0.7)
            # clear the jaw columns, then redraw the upper jaw higher and the lower jaw lower
            for y in range(8, H + 2): rows[y][c] = '.'
            for y in range(9, 15):
                if old[y][c] != '.': rows[y - up][c] = old[y][c]
            for y in range(15, H):
                if old[y][c] != '.': rows[y + down][c] = old[y][c]
            # the inside of the open mouth
            top = max(y for y in range(0, 15) if rows[y][c] != '.') + 1
            bot = min(y for y in range(15, H + 2) if rows[y][c] != '.')
            for y in range(top, bot):
                rows[y][c] = 'E'
        rows[14][21] = '7'; rows[14][22] = '7'; rows[15][22] = '7'
    elif phase == 3:
        # jaws shut: interlocking teeth, tongue hidden, a splash in front of the snout
        for c in range(23, 31):
            rows[14][c] = '6' if c % 2 == 0 else '0'
            rows[15][c] = '0' if c % 2 == 0 else '6'
        rows[14][21] = '2'; rows[14][22] = '2'
        rows[15][30] = '0'; rows[14][30] = '0'
        for (x, y) in ((32, 11), (33, 13), (32, 15), (33, 17), (31, 18)):
            rows[y][x] = SPLASH
    return rows

def adult_grid(blink=False, legs=0, tail=0, jaw=0, bite=0):
    rows = [list(r) for r in REF]
    H, W = len(rows), len(rows[0])
    if bite:
        rows = bite_pose(rows, bite)
        H, W = len(rows), len(rows[0])
    if blink:
        rows = [['0' if c == '5' else c for c in r] for r in rows]
    if tail:
        # tail tip leans one cell back (rows 0..4 sit at the left in the mirrored drawing)
        for y in range(0, 5):
            r = rows[y]; rows[y] = r[1:] + ['.'] if tail > 0 else r
    if legs:
        # legs are the bottom 3 rows; front and back legs shift opposite ways
        for y in range(H - 3, H):
            r = rows[y]
            mid = W // 2
            back, front = r[:mid], r[mid:]
            back = (back[1:] + ['.']) if legs > 0 else (['.'] + back[:-1])
            front = (['.'] + front[:-1]) if legs > 0 else (front[1:] + ['.'])
            rows[y] = back + front
    # double every pixel
    big = []
    for r in rows:
        line = [c for c in r for _ in (0, 1)]
        big.append(line); big.append(list(line))
    # refine at full resolution: a 1-pixel highlight along the back, belly shade, crisp eye pupil
    for y in range(len(big)):
        for x in range(len(big[0])):
            if big[y][x] == '5' and (x % 2 == 1) and y % 2 == 1:
                big[y][x] = '0'
    if jaw:
        # open the jaw wider: everything below the mouth line at the snout drops `jaw` pixels
        cut = None
        for y in range(len(big)):
            if '6' in big[y][-14:]:
                cut = y; break
        if cut is not None:
            snout = range(len(big[0]) - 16, len(big[0]))
            for y in range(len(big) - 1, cut, -1):
                for x in snout:
                    big[y][x] = big[y - jaw][x] if y - jaw > cut else ('7' if big[y][x] != '.' or y - jaw <= cut else '.')
    return big

def adult(**k):
    big = adult_grid(**k)
    g = blank()
    oy, ox = 5, 9
    for y, r in enumerate(big):
        for x, c in enumerate(r):
            if c != '.' and 0 <= y + oy < CH and 0 <= x + ox < CW: g[y + oy][x + ox] = c
    return g

def project(name, poses, mouth, radius):
    return {"name": name, "w": CW, "h": CH, "palette": PAL, "framework": "crocodile",
            "bodyRadius": radius, "mouth": mouth, "pixelScale": 3,
            "poses": [{"name": n, "fps": f, "frames": [to_str(x) for x in fr]} for n, f, fr in poses],
            "updatedAt": "2026-11-21T11:30:00.000Z", "seedVersion": 3}

frames = {
  'croc-hatchling': ("Crocodile 1: Hatchling", [
      ("idle", 3, [hatch(), hatch(tail_up=1), hatch(blink=True)]),
      ("move", 6, [hatch(legs=1), hatch(legs=-1, tail_up=1)]),
      ("attack", 8, []), ("damage", 6, []), ("celebrate", 6, [hatch(cap_tilt=-1), hatch()]), ("rest", 2, [])], [59, 25], 9),
  'croc-juvenile': ("Crocodile 2: Juvenile", [
      ("idle", 3, [juv(), juv(tail_up=1), juv(blink=True)]),
      ("move", 6, [juv(legs=1), juv(legs=-1, tail_up=1)]),
      ("attack", 8, []), ("damage", 6, []), ("celebrate", 6, []), ("rest", 2, [])], [61, 28], 7),
  'croc-adult': ("Crocodile 3: Adult", [
      ("idle", 3, [adult(), adult(tail=1), adult(blink=True)]),
      ("move", 6, [adult(legs=1), adult(legs=-1)]),
      ("attack", 10, [adult(bite=1), adult(bite=2), adult(bite=3), adult()]), ("damage", 6, []), ("celebrate", 6, []), ("rest", 2, [])], [66, 33], 9),
}
out = {}
for pid, (name, poses, mouth, radius) in frames.items():
    for n, f, fr in poses:
        for i, g in enumerate(fr): check_margin(g, f'{pid}/{n}/{i}')
    out[pid] = project(name, poses, mouth, radius)
    json.dump(out[pid], open(pid + '.json', 'w'))

# preview: every frame with the framework guides
from PIL import ImageDraw
def guides(p, s, k=6):
    im = frame_img(p, s, k=k)
    dr = ImageDraw.Draw(im)
    dr.rectangle([MARGIN * k, MARGIN * k, (CW - MARGIN) * k - 1, (CH - MARGIN) * k - 1], outline=(255, 120, 120))
    cx, cy = CW / 2 * k, CH / 2 * k; r = p['bodyRadius'] * k
    dr.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255))
    mx, my = (p['mouth'][0] + .5) * k, (p['mouth'][1] + .5) * k
    dr.ellipse([mx - 6, my - 6, mx + 6, my + 6], outline=(255, 200, 0), width=2)
    return im
rows = []
for p in out.values():
    fr = [f for po in p['poses'] for f in po['frames']]
    rows.append([guides(p, f) for f in fr])
Wd = max(sum(i.width + 8 for i in r) for r in rows); Hd = sum(r[0].height + 8 for r in rows)
sheet = Image.new('RGB', (Wd, Hd), (10, 20, 30)); y = 0
for r in rows:
    x = 0
    for i in r: sheet.paste(i, (x, y)); x += i.width + 8
    y += r[0].height + 8
sheet.save('fw_all.png')
main = Image.new('RGB', (3 * (CW * 8 + 10), CH * 8), (10, 20, 30))
for i, p in enumerate(out.values()): main.paste(guides(p, p['poses'][0]['frames'][0], k=8), (i * (CW * 8 + 10), 0))
main.save('fw_main.png')
print('ok')
