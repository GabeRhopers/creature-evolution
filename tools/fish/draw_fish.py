# Pixel fish for the reef, on the sprite framework (body center = canvas center, facing right).
# Pixel density target: about 3.5 world pixels per art pixel (size / bodyRadius), like the crocodile.
import json, math, sys
sys.path.insert(0, '../stages')
from render import frame_img
from PIL import Image, ImageDraw

OUT = '#181425'                 # outline (Endesga 32)
EYE_W, PUPIL = '#ffffff', '#181425'
MOUTH = '#3e2731'
BONE, BONE2 = '#ead4aa', '#8b9bb4'
STAMP = '2026-11-21T12:00:00.000Z'

class Grid:
    def __init__(s, w, h): s.w, s.h = w, h; s.g = [[None] * w for _ in range(h)]
    def px(s, x, y, c):
        x, y = math.floor(x + 0.5), math.floor(y + 0.5)   # plain rounding (Python's round() alternates on .5)
        if 0 <= x < s.w and 0 <= y < s.h: s.g[y][x] = c
    def get(s, x, y): return s.g[y][x] if 0 <= x < s.w and 0 <= y < s.h else None
    def outline(s, color=OUT):
        add = [(x, y) for y in range(s.h) for x in range(s.w) if s.g[y][x] is None and any(
            s.get(x + dx, y + dy) not in (None, color) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
        for x, y in add: s.g[y][x] = color

def fish(w, h, rx, ry, top, mid, belly, fin, tail_len, tail_spread=0.7, flex=0, fork=True, dorsal=4,
         dorsal_color=None, pattern=None, bite=False, teeth=False, eye=(0.55, -0.3), front_taper=0.85, lip=None):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    rxf = rx * front_taper
    # tail (behind the body, flexes up or down)
    x0 = cx - rx + 1
    for d in range(0, tail_len + 1):
        x = x0 - d
        c = cy + flex * (d / max(1, tail_len)) * 2
        half = 1 + d * tail_spread
        for y in range(int(c - half - 1), int(c + half + 2)):
            if abs(y - c) <= half:
                if fork and d > tail_len * 0.55 and abs(y - c) < (d - tail_len * 0.55) * 0.9: continue
                g.px(x, y, fin)
    # dorsal fin (leans back)
    for i in range(dorsal):
        for x in range(int(cx - rx * 0.35 - i), int(cx + rx * 0.2 - i * 1.6)):
            g.px(x, cy - ry - i, dorsal_color or fin)
    # belly fin
    for i in range(max(1, dorsal // 2)):
        for x in range(int(cx - rx * 0.1 - i), int(cx + rx * 0.08 - i)):
            g.px(x, cy + ry + i, fin)
    # body
    for y in range(h):
        for x in range(w):
            rr = rxf if x > cx else rx
            v = ((x - cx) / rr) ** 2 + ((y - cy) / ry) ** 2
            if v <= 1:
                t = (y - cy) / ry
                col = top if t < -0.3 else belly if t > 0.4 else mid
                if pattern: col = pattern(x, y, cx, cy, rx, ry, col)
                g.px(x, y, col)
    # pectoral fin
    for i in range(3):
        g.px(cx + rx * 0.2 - i, cy + ry * 0.25 + i * 0.6, fin)
    # eye
    ex, ey = cx + rxf * eye[0], cy + ry * eye[1]
    g.px(ex, ey, EYE_W); g.px(ex + 1, ey, PUPIL)
    if ry >= 8: g.px(ex, ey + 1, EYE_W); g.px(ex + 1, ey + 1, PUPIL)
    front = int(cx + rxf)
    my = cy + ry * 0.25
    if bite:
        depth = max(3, int(rx * 0.35))
        for x in range(front - depth, front + 2):
            open_h = (x - (front - depth)) * 0.7
            for y in range(int(my - open_h), int(my + open_h) + 1):
                if g.get(x, y) is not None or x > front - 1: g.px(x, y, MOUTH)
        for x in range(front - depth + 1, front + 1, 2):
            if teeth:
                g.px(x, my - (x - (front - depth)) * 0.7, EYE_W); g.px(x, my + (x - (front - depth)) * 0.7, EYE_W)
        for y in range(h):
            for x in range(front - 1, w):
                if g.get(x, y) == MOUTH and g.get(x + 1, y) is None and abs(y - my) > 1: pass
    else:
        for x in range(front - max(2, int(rx * 0.3)), front + 1): g.px(x, my, OUT)
        if lip: g.px(front, my + 1, lip)
        if teeth:
            for x in range(front - max(2, int(rx * 0.3)) + 1, front, 2): g.px(x, my + 1, EYE_W)
    g.outline()
    return g

def skeleton(w, h, rx, ry, tail_len):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    # skull
    for y in range(h):
        for x in range(w):
            if x > cx + rx * 0.45 and ((x - (cx + rx * 0.7)) / (rx * 0.32)) ** 2 + ((y - cy) / (ry * 0.75)) ** 2 <= 1: g.px(x, y, BONE)
    g.px(cx + rx * 0.72, cy - ry * 0.2, OUT); g.px(cx + rx * 0.72 + 1, cy - ry * 0.2, OUT)
    # spine
    for x in range(int(cx - rx), int(cx + rx * 0.5)): g.px(x, cy, BONE)
    # ribs
    for x in range(int(cx - rx * 0.7), int(cx + rx * 0.35), 3):
        k = 1 - abs((x - cx) / rx)
        for y in range(1, int(ry * 0.8 * k) + 1):
            g.px(x, cy - y, BONE); g.px(x, cy + y, BONE2)
    # tail fork
    x0 = cx - rx
    for d in range(tail_len):
        g.px(x0 - d, cy - d * 0.6, BONE); g.px(x0 - d, cy + d * 0.6, BONE)
    g.outline()
    return g

def project(name, fw, w, h, radius, mouth, poses):
    pal = []
    frames_out = []
    for pname, fps, grids in poses:
        enc = []
        for gr in grids:
            s = ''
            for y in range(h):
                for x in range(w):
                    c = gr.g[y][x]
                    if c is None: s += '.'; continue
                    if c not in pal: pal.append(c)
                    s += '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'[pal.index(c)]
            enc.append(s)
        frames_out.append({"name": pname, "fps": fps, "frames": enc})
    return {"name": name, "w": w, "h": h, "palette": pal, "framework": fw, "bodyRadius": radius, "mouth": mouth,
            "pixelScale": 3, "poses": frames_out, "updatedAt": STAMP, "seedVersion": 3}

def check_margin(gr, m, label):
    for y in range(gr.h):
        for x in range(gr.w):
            if gr.g[y][x] is not None and (x < m or y < m or x >= gr.w - m or y >= gr.h - m):
                raise SystemExit(f'{label}: pixel at {x},{y} in margin')

def tang_pattern(x, y, cx, cy, rx, ry, col):
    # the dark swoosh along the upper body
    t = (x - cx) / rx
    band = cy - ry * 0.15 - 2.2 * math.sin((t + 0.9) * 1.6)
    if -0.75 < t < 0.55 and abs(y - band) <= 0.9: return '#262b44'
    return col

GROUPER_SPOTS = [(-12, -6), (-4, -8), (5, -7), (-15, 2), (-7, -1), (2, 1), (10, -2), (-10, 7), (-1, 8)]
def grouper_spots(x, y, cx, cy, rx, ry, col):
    # a few round dark spots (2x2 with a 1-pixel highlight) on the upper and middle body
    for sx, sy in GROUPER_SPOTS:
        dx, dy = x - (cx + sx), y - (cy + sy)
        if 0 <= dx <= 1 and 0 <= dy <= 1 and col != '#f6757a': return '#733e39'
    return col

def shark_pattern(x, y, cx, cy, rx, ry, col):
    return col

SPECS = {
  'fish-blue_tang': dict(name='Blue Tang', fw='fish', w=40, h=32, radius=5, rx=10, ry=6,
      top='#124e89', mid='#0099db', belly='#2ce8f5', fin='#feae34', tail_len=6, dorsal=2, dorsal_color='#124e89', pattern=tang_pattern, bites=False),
  'fish-reef_snapper': dict(name='Reef Snapper', fw='fish', w=40, h=32, radius=7, rx=12, ry=7,
      top='#be4a2f', mid='#d77643', belly='#e4a672', fin='#be4a2f', tail_len=5, dorsal=3, bites=True),
  'fish-red_grouper': dict(name='Red Grouper', fw='bigfish', w=80, h=48, radius=14, rx=24, ry=14,
      top='#a22633', mid='#e43b44', belly='#f6757a', fin='#a22633', tail_len=10, tail_spread=0.8, fork=False, dorsal=5, pattern=grouper_spots, bites=True, front_taper=0.95, lip='#733e39'),
  'fish-grey_shark': dict(name='Grey Hunter', fw='shark', w=112, h=56, radius=24, rx=37, ry=12,
      top='#5a6988', mid='#8b9bb4', belly='#c0cbdc', fin='#5a6988', tail_len=12, tail_spread=1.0, dorsal=10, dorsal_color='#3a4466', bites=True, teeth=True, front_taper=0.75, eye=(0.6, -0.35)),
}
FW = {'fish': 2, 'bigfish': 2, 'shark': 2}
out = {}
for pid, sp in SPECS.items():
    kw = {k: v for k, v in sp.items() if k in ('rx','ry','top','mid','belly','fin','tail_len','tail_spread','fork','dorsal','dorsal_color','pattern','teeth','eye','front_taper','lip')}
    w, h = sp['w'], sp['h']
    swim = [fish(w, h, flex=-1, **kw), fish(w, h, flex=1, **kw)]
    poses = [("idle", 3, [swim[0]]), ("move", 6, swim)]
    if sp['bites']: poses.append(("attack", 8, [fish(w, h, flex=0, bite=True, **kw)]))
    poses.append(("dead", 1, [skeleton(w, h, sp['rx'], sp['ry'], sp['tail_len'])]))
    for pn, _, grs in poses:
        for i, gr in enumerate(grs): check_margin(gr, FW[sp['fw']], f'{pid}/{pn}/{i}')
    cx = w / 2 - 0.5
    mouth = [int(cx + sp['rx'] * sp.get('front_taper', 0.85)), int(h / 2 - 0.5 + sp['ry'] * 0.25)]
    out[pid] = project(sp['name'], sp['fw'], w, h, sp['radius'], mouth, poses)
    json.dump(out[pid], open(pid + '.json', 'w'))

# preview: every frame of every fish at 5x
rows = []
for p in out.values():
    rows.append([frame_img(p, f, k=5) for po in p['poses'] for f in po['frames']])
W = max(sum(i.width + 8 for i in r) for r in rows); H = sum(max(i.height for i in r) + 8 for r in rows)
sheet = Image.new('RGB', (W, H), (10, 20, 30)); y = 0
for r in rows:
    x = 0
    for i in r: sheet.paste(i, (x, y)); x += i.width + 8
    y += max(i.height for i in r) + 8
sheet.save('fish_all.png'); print('ok', sheet.size)
