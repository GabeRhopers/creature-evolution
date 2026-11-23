# Sea creatures that are not fish (run from tools/fish: python3 draw_beasts.py):
# Box Jellyfish, Sea Snake, Giant Octopus, Giant Squid, Orca.
# Same framework rules as draw_fish.py: body center = canvas center, facing right, Endesga 32 colors.
import json, math
from draw_fish import Grid, fish, skeleton, project, check_margin, OUT, EYE_W, PUPIL, MOUTH, frame_img
from PIL import Image

def ellipse(g, cx, cy, rx, ry, color_at):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                c = color_at(x, y)
                if c: g.px(x, y, c)

def thick_line(g, pts, widths, colors):
    """A tapering tube through pts (list of (x, y)), widths per point, color per point (or one)."""
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) * 2))
        for k in range(n + 1):
            t = k / n
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            w = widths[i] + (widths[i + 1] - widths[i]) * t
            col = colors[i] if isinstance(colors, list) else colors
            r = w / 2
            for yy in range(int(y - r), int(y + r) + 1):
                g.px(x, yy, col)

# ------------------------------------------------------------------ box jellyfish (bell first, tentacles trailing)
def jelly(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    bx = cx + 4
    rx, ry = (5, 6) if bite else (7, 7)
    # tentacles first (behind the bell): four long, wavy, trailing
    for i, ty in enumerate((-5, -2, 2, 5)):
        for d in range(0, 17):
            x = bx - 1 - d
            y = cy + ty * (1.25 if bite else 1) + math.sin(d * 0.55 + phase + i) * (1 + d * 0.08)
            g.px(x, y, '#2ce8f5' if d % 4 < 2 else '#c0cbdc')
    # the bell: a dome facing right, pale and see-through, with a cyan rim and pink insides
    def bell(x, y):
        if x < bx - 1: return None
        if ((x - bx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 0.6: return '#c0cbdc'
        return '#ffffff' if y < cy - 2 and x > bx + 1 else '#8b9bb4'
    ellipse(g, bx, cy, rx, ry, bell)
    for y in range(int(cy - ry), int(cy + ry) + 1): g.px(bx - 1, y, '#2ce8f5')
    for (ox, oy) in ((1, -2), (2, 1), (1, 3)): g.px(bx + ox, cy + oy, '#b55088')
    g.outline('#3a4466')
    return g

# ------------------------------------------------------------------ sea snake (banded, swims in waves, paddle tail)
def snake(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    x0, x1 = cx - 30, cx + 22
    def wave(x):
        u = (x - x0) / (x1 - x0)
        return cy + 4 * math.sin((x - x0) * 0.2 + phase) * (1 - u * 0.7)
    # paddle tail: flat and tall at the very end
    for y in range(-4, 5): g.px(x0 - 1, wave(x0) + y * 0.8, '#262b44')
    for x in range(int(x0), int(x1) + 1):
        yc = wave(x)
        band = int((x - x0) // 4) % 2
        for dy in (-2, -1, 0, 1, 2):
            col = '#262b44' if band else ('#c0cbdc' if dy > 0 else '#8b9bb4')
            g.px(x, yc + dy, col)
    # head: a little wider, dark with a pale snout
    hy = wave(x1)
    ellipse(g, x1 + 3, hy, 5, 3.2, lambda x, y: '#c0cbdc' if x > x1 + 5 else '#262b44')
    g.px(x1 + 4, hy - 1, EYE_W); g.px(x1 + 5, hy - 1, PUPIL)
    if bite:
        for x in range(int(x1 + 4), int(x1 + 9)):
            g.px(x, hy + 1, MOUTH); g.px(x, hy + 2, MOUTH)
        g.px(x1 + 7, hy + 1, EYE_W); g.px(x1 + 5, hy + 2, EYE_W)
    else:
        for x in range(int(x1 + 4), int(x1 + 8)): g.px(x, hy + 1, OUT)
    g.outline()
    return g

# ------------------------------------------------------------------ giant octopus (mantle first, arms trailing)
def octopus(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    mx, my = cx + 14, cy - 2
    # arms: five visible, each a tapering curl trailing behind (spread wide to attack)
    spread = 1.8 if bite else 1.0
    for i, a in enumerate((-0.5, -0.25, 0.0, 0.25, 0.5)):
        pts, wid = [], []
        x, y, ang = mx - 6, my + 5 + a * 4, math.pi + a * spread
        for k in range(9):
            pts.append((x, y)); wid.append(max(1, 4 - k * 0.4))
            ang += (0.09 + 0.02 * i) * math.sin(phase + k * 0.6 + i)
            x += math.cos(ang) * 3.2; y += math.sin(ang) * 3.2
        thick_line(g, pts, wid, ['#be4a2f'] * 3 + ['#d77643'] * 6)
        for (px_, py_) in pts[1:6:2]: g.px(px_, py_ + 1, '#e8b796')   # suckers
    # mantle: a big rounded head
    ellipse(g, mx, my, 11, 8, lambda x, y: '#e8b796' if (x + y) % 7 == 0 else ('#d77643' if y < my - 2 else '#be4a2f'))
    # eye near the arm base, with a slit pupil
    g.px(mx - 5, my + 3, '#feae34'); g.px(mx - 4, my + 3, '#feae34'); g.px(mx - 5, my + 4, PUPIL); g.px(mx - 4, my + 4, '#feae34')
    g.outline()
    return g

# ------------------------------------------------------------------ giant squid (attacks arms first)
def squid(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    # mantle: a long cone at the back, with triangle fins at its tip
    tip, head = cx - 42, cx + 6
    for x in range(int(tip), int(head) + 1):
        u = (x - tip) / (head - tip)
        hh = 2 + 9 * math.sqrt(max(0.0, u))
        for y in range(int(cy - hh), int(cy + hh) + 1):
            g.px(x, y, '#e43b44' if y < cy - hh * 0.3 else '#a22633' if y > cy + hh * 0.4 else '#be4a2f')
    for k in range(10):
        for s in (-1, 1):
            for y in range(int(3 + k * 0.9)): g.px(tip + 2 + k, cy + s * (2 + y), '#a22633')
    # head with a huge eye
    ellipse(g, head + 3, cy, 6, 8, lambda x, y: '#e43b44' if y < cy else '#be4a2f')
    ellipse(g, head + 3, cy - 1, 3, 3, lambda x, y: EYE_W)
    g.px(head + 4, cy - 1, PUPIL); g.px(head + 4, cy, PUPIL); g.px(head + 3, cy, PUPIL)
    # eight arms and two long feeding tentacles, reaching forward
    reach = 1.12 if bite else 1.0
    for i, a in enumerate((-0.35, -0.2, -0.07, 0.07, 0.2, 0.35)):
        pts, wid = [], []
        x, y, ang = head + 7, cy + a * 10, a * (2.2 if bite else 1.0)
        for k in range(8):
            pts.append((x, y)); wid.append(max(1, 3 - k * 0.35))
            ang += 0.12 * math.sin(phase + k * 0.7 + i)
            x += math.cos(ang) * 3.4 * reach; y += math.sin(ang) * 3.4
        thick_line(g, pts, wid, '#e43b44')
    for s in (-1, 1):
        pts = [(head + 7, cy + s * 2)]
        for k in range(1, 13): pts.append((head + 7 + k * 2.9 * reach, cy + s * (2 + k * 0.5) + math.sin(phase + k * 0.5) * 1.5))
        thick_line(g, pts, [1.5] * 12 + [3], '#f6757a')
    g.outline()
    return g

# ------------------------------------------------------------------ orca (black and white, tall dorsal fin)
ORCA_RX, ORCA_RY = 40, 13
def orca_pattern(x, y, cx, cy, rx, ry, col):
    t = (y - cy) / ry
    u = (x - cx) / rx
    if t > 0.3 + 0.2 * max(0, -u) and u > -0.7: return '#ffffff'            # white belly and chin
    if ((x - (cx + rx * 0.45)) / 5) ** 2 + ((y - (cy - ry * 0.2)) / 2.2) ** 2 <= 1: return '#ffffff'  # eye patch
    if -0.35 < u < -0.05 and t < -0.55: return '#5a6988'                     # grey saddle
    return '#262b44'

def orca_extra(g, cx, cy, bite):
    # small eye in front of the patch, a rounded paddle flipper
    g.px(cx + ORCA_RX * 0.62, cy - 1, OUT)
    for i in range(6):
        for j in range(3): g.px(cx + 12 - i, cy + 8 + i * 0.7 + j, '#262b44')

# ------------------------------------------------------------------ build
FW = {'fish': 2, 'bigfish': 2, 'shark': 2}
out = {}
def add(pid, name, fw, w, h, radius, mouth, draw, bites=True, fps=(3, 6)):
    poses = [("idle", fps[0], [draw(w, h, 0.0)]), ("move", fps[1], [draw(w, h, p) for p in (0.0, 1.6, 3.2, 4.8)])]
    if bites: poses.append(("attack", 8, [draw(w, h, 1.0, bite=True)]))
    out[pid] = (name, fw, w, h, radius, mouth, poses)

add('beast-box_jelly', 'Box Jellyfish', 'fish', 40, 32, 6, [int(20 + 10), 16], jelly, fps=(3, 4))
add('beast-sea_snake', 'Sea Snake', 'bigfish', 80, 48, 8, [int(40 + 30), 24], snake)
add('beast-giant_octopus', 'Giant Octopus', 'bigfish', 80, 48, 12, [int(40 + 25), 22], octopus, fps=(3, 5))
add('beast-giant_squid', 'Giant Squid', 'shark', 112, 56, 22, [int(56 + 40), 28], squid)
kw = dict(rx=ORCA_RX, ry=ORCA_RY, top='#262b44', mid='#262b44', belly='#ffffff', fin='#262b44', tail_len=13, tail_spread=1.1,
          dorsal=12, dorsal_color="#262b44", pattern=orca_pattern, teeth=True, front_taper=0.85, eye=(0.62, -0.1), extra=orca_extra)
ow, oh = 112, 56
oposes = [("idle", 3, [fish(ow, oh, flex=-1, **kw)]), ("move", 6, [fish(ow, oh, flex=-1, **kw), fish(ow, oh, flex=1, **kw)]),
          ("attack", 8, [fish(ow, oh, flex=0, bite=True, **kw)]), ("dead", 1, [skeleton(ow, oh, ORCA_RX, ORCA_RY, 13)])]
out['beast-orca'] = ('Orca', 'shark', ow, oh, 26, [int(ow / 2 - 0.5 + ORCA_RX * 0.85), int(oh / 2 - 0.5 + ORCA_RY * 0.25)], oposes)
# simple skeletons for the soft-bodied ones (a jelly leaves nothing much; squid and octopus leave a beak and pen)
def pale(src):
    # a limp, faded body: every color becomes bone or grey (soft-bodied animals leave no skeleton)
    g = Grid(src.w, src.h)
    for y in range(src.h):
        for x in range(src.w):
            c = src.g[y][x]
            if c is None: continue
            g.g[y][x] = OUT if c in (OUT, '#3a4466') else ('#ead4aa' if (int(c[1:3], 16) + int(c[3:5], 16)) > 260 else '#8b9bb4')
    return g
name, fw, w, h, radius, mouth, poses = out['beast-sea_snake']
poses.append(("dead", 1, [skeleton(w, h, 28, 3, 2)]))
for pid, draw in (('beast-box_jelly', jelly), ('beast-giant_octopus', octopus), ('beast-giant_squid', squid)):
    name, fw, w, h, radius, mouth, poses = out[pid]
    poses.append(("dead", 1, [pale(draw(w, h, 0.0))]))

projects = {}
for pid, (name, fw, w, h, radius, mouth, poses) in out.items():
    for pn, _, grs in poses:
        for i, gr in enumerate(grs): check_margin(gr, FW[fw], f'{pid}/{pn}/{i}')
    projects[pid] = project(name, fw, w, h, radius, mouth, poses)
    json.dump(projects[pid], open(pid + '.json', 'w'))

rows = [[frame_img(p, f, k=4) for po in p['poses'] for f in po['frames']] for p in projects.values()]
W = max(sum(i.width + 8 for i in r) for r in rows); H = sum(max(i.height for i in r) + 8 for r in rows)
sheet = Image.new('RGB', (W, H), (10, 20, 30)); y = 0
for r in rows:
    x = 0
    for i in r: sheet.paste(i, (x, y)); x += i.width + 8
    y += max(i.height for i in r) + 8
sheet.save('beasts_all.png'); print('ok', sheet.size)
