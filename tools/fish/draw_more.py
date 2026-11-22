# More sea creatures, one or two per region (run from tools/fish: python3 draw_more.py).
# Same framework rules as draw_fish.py: body center = canvas center, facing right, Endesga 32 colors.
import json, math
from draw_fish import Grid, fish, skeleton, project, check_margin, OUT, EYE_W, PUPIL, MOUTH, frame_img
from PIL import Image

# ------------------------------------------------------------------ small prey
def archer_bands(x, y, cx, cy, rx, ry, col):
    # banded archerfish: black wedges hanging from the back
    t = (x - cx) / rx
    for bx in (-0.55, -0.15, 0.25):
        if abs(t - bx) < 0.1 and y < cy + ry * 0.35 - abs(t - bx) * 8: return OUT
    return col

def archer_extra(g, cx, cy, bite):
    # pointed snout tip and a big eye on top (it aims from just under the surface)
    g.px(cx + 9, cy - 1, '#c0cbdc')

def cod_extra(g, cx, cy, bite):
    # three small dorsal fins and two below (cod family), a chin barbel
    for fx in (-5, 0, 5):
        for i in range(2):
            for x in range(int(cx + fx - 1 - i), int(cx + fx + 2 - i)): g.px(x, cy - 6 - i, '#5a6988')
    for fx in (-3, 3):
        for x in range(int(cx + fx - 1), int(cx + fx + 2)): g.px(x, cy + 6, '#5a6988')
    g.px(cx + 9, cy + 3, '#c0cbdc'); g.px(cx + 9, cy + 4, '#c0cbdc')

def cod_speckle(x, y, cx, cy, rx, ry, col):
    if y < cy - ry * 0.2 and (int(x) * 7 + int(y) * 3) % 5 == 0: return '#262b44'
    return col

# ------------------------------------------------------------------ anglerfish
def angler(w, h, flex=0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 + 1.5
    rx, ry = 9, 8
    top, mid, belly, fin = '#3e2731', '#733e39', '#b86f50', '#3e2731'
    # small rounded tail
    for d in range(5):
        c = cy + flex * d / 4 * 1.5
        for y in range(int(c - 1 - d * 0.6), int(c + 2 + d * 0.6)): g.px(cx - rx + 1 - d, y, fin)
    # body: a round lump, wide at the head
    for y in range(h):
        for x in range(w):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                t = (y - cy) / ry
                g.px(x, y, top if t < -0.3 else belly if t > 0.45 else mid)
    # little fin on the side
    for i in range(3): g.px(cx - 2 - i, cy + 2 + i * 0.5, fin)
    # the lure: a stalk from the forehead bending forward, with a glowing tip
    for k, (sx, sy) in enumerate([(2, -8), (2, -9), (3, -10), (4, -11), (5, -11), (6, -11), (7, -10)]):
        g.px(cx + sx, cy + sy, '#b86f50')
    g.px(cx + 8, cy - 9, '#2ce8f5'); g.px(cx + 9, cy - 9, '#ffffff'); g.px(cx + 8, cy - 8, '#2ce8f5'); g.px(cx + 9, cy - 8, '#2ce8f5')
    # huge mouth with needle teeth, lower jaw jutting forward
    mx = int(cx + rx - 1)
    gape = 4 if bite else 2
    for x in range(mx - 6, mx + 3):
        for y in range(int(cy + 1), int(cy + 1 + gape + (x - (mx - 6)) * 0.25)): g.px(x, y, MOUTH)
    for x in range(mx - 5, mx + 3, 2): g.px(x, cy + 1, EYE_W); g.px(x + 1, cy + gape + 2, EYE_W)
    for x in range(mx - 2, mx + 3): g.px(x, cy + gape + 3, mid)   # jutting jaw
    # small pale eye high on the head
    g.px(cx + 4, cy - 4, EYE_W); g.px(cx + 5, cy - 4, PUPIL)
    g.outline()
    return g

ANGLER_LURE = (8.5, -8.5)   # esca, relative to the body center (art px)

# ------------------------------------------------------------------ sharks
def white_belly(x, y, cx, cy, rx, ry, col):
    # great white: dark back, sharp jagged line to a white belly
    t = (y - cy) / ry
    edge = 0.12 + 0.06 * math.sin(x * 0.35)
    if t > edge: return '#ffffff'
    return '#3a4466' if t < -0.35 else '#5a6988'

def gw_extra(g, cx, cy, bite):
    # black eye, gill slits
    ex = cx + 40 * 0.75 * 0.62
    g.px(ex, cy - 14 * 0.32, OUT); g.px(ex + 1, cy - 14 * 0.32, OUT)
    for k in range(4):
        for y in range(3): g.px(cx + 14 - k * 2, cy - 2 + y, '#3a4466')

def bull_extra(g, cx, cy, bite):
    for k in range(4):
        for y in range(3): g.px(cx + 12 - k * 2, cy - 2 + y, '#733e39')

# ------------------------------------------------------------------ leopard seal
SEAL_SPOTS = [(-20, 1), (-14, -2), (-9, 2), (-3, -1), (3, 2), (-17, 4), (-6, 4), (8, 0), (-24, -1)]
def seal_spots(x, y, cx, cy, rx, ry, col):
    for sx, sy in SEAL_SPOTS:
        if int(x) == int(cx + sx) and int(y) == int(cy + sy): return '#262b44'
    return col

def seal_extra(g, cx, cy, bite):
    # long front flipper, whiskers, nostril, no fins on the back
    for i in range(6):
        for j in range(2): g.px(cx + 8 - i, cy + 6 + i * 0.6 + j, '#5a6988')
    g.px(cx + 27, cy - 1, '#ffffff'); g.px(cx + 26, cy - 2, '#ffffff')
    g.px(cx + 28, cy - 3, OUT)

# ------------------------------------------------------------------ sperm whale
def whale(w, h, flex=0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    rx, ry = 76, 20
    top, mid, belly, fin = '#3a4466', '#5a6988', '#8b9bb4', '#3a4466'
    x0, x1 = cx - rx, cx + rx
    def bend(u): return flex * max(0.0, 0.45 - u) / 0.45 * 4   # the back half swings up and down
    def half(u):
        if u > 0.62: return ry
        if u > 0.16:
            s = (u - 0.16) / 0.46
            return ry * (0.3 + 0.7 * (3 * s * s - 2 * s * s * s))
        return ry * (0.16 + 0.14 * u / 0.16)
    # flukes: a broad notched tail at the very back
    tl = 13
    for d in range(tl + 1):
        c = cy + 2 + bend(0) + flex * d / tl * 3
        hh = 1 + d * 1.05
        for y in range(int(c - hh - 1), int(c + hh + 2)):
            if abs(y - c) <= hh and not (d > tl * 0.6 and abs(y - c) < (d - tl * 0.6) * 0.8):
                g.px(x0 - d, y, fin)
    # body and the huge square head
    for x in range(int(x0), int(x1) + 1):
        u = (x - x0) / (2 * rx)
        hh = half(u)
        c = cy + 2 + bend(u)
        tp, bt = c - hh, c + hh * 0.92
        if u > 0.62: tp, bt = cy - ry + 2, cy + ry * 0.85
        if u > 0.965:  # rounded front corners
            k = (u - 0.965) / 0.035
            tp += 3 * k * k; bt -= 5 * k * k
        for y in range(int(math.ceil(tp)), int(bt) + 1):
            t = (y - tp) / max(1, bt - tp)
            col = top if t < 0.3 else belly if t > 0.78 else mid
            # wrinkled skin behind the head
            if 0.2 < u < 0.6 and 0.35 < t < 0.7 and (x * 3 + y * 5) % 11 == 0: col = top
            g.px(x, y, col)
    # dorsal hump and the knuckles behind it
    hx = x0 + 2 * rx * 0.36
    for i in range(4):
        for x in range(int(hx - 4 + i), int(hx + 3 - i)): g.px(x, cy + 2 + bend(0.36) - half(0.36) - 1 - i, top)
    for k in range(1, 4):
        kx = hx - k * 6
        g.px(kx, cy + 2 + bend((kx - x0) / (2 * rx)) - half((kx - x0) / (2 * rx)) - 1, top)
    # blowhole at the front of the head, a small flipper, a small eye near the jaw hinge
    g.px(x1 - 4, cy - ry + 1, OUT)
    fx = x0 + 2 * rx * 0.6
    for i in range(5):
        for j in range(2): g.px(fx - i, cy + 10 + i * 0.7 + j, top)
    ex, ey = x0 + 2 * rx * 0.66, cy + 4
    g.px(ex, ey, EYE_W); g.px(ex + 1, ey, PUPIL)
    # narrow lower jaw under the head (opens down to bite), white teeth
    jx0, jx1 = x0 + 2 * rx * 0.64, x1 - 9
    jy = cy + ry * 0.85
    for x in range(int(jx0), int(jx1) + 1):
        drop = (x - jx0) / (jx1 - jx0) * (7 if bite else 0)
        g.px(x, jy + drop, '#c0cbdc'); g.px(x, jy + drop + 1, '#8b9bb4')
        if bite:
            for y in range(int(jy), int(jy + drop)): g.px(x, y, MOUTH)
            if (x - int(jx0)) % 3 == 0: g.px(x, jy + drop - 1, EYE_W)
        elif (x - int(jx0)) % 3 == 0: g.px(x, jy - 1, EYE_W)
    g.outline()
    return g

def whale_skeleton(w, h):
    g = skeleton(w, h, 70, 14, 12)
    return g

# ------------------------------------------------------------------ the list
SPECS = {
  'fish-archerfish': dict(name='Archerfish', fw='fish', w=40, h=32, radius=6, rx=10, ry=6,
      top='#3e8948', mid='#c0cbdc', belly='#ffffff', fin='#5a6988', tail_len=4, fork=False, dorsal=2, dorsal_color='#3e8948',
      pattern=archer_bands, front_taper=0.7, eye=(0.45, -0.45), extra=archer_extra, bites=False),
  'fish-polar_cod': dict(name='Polar Cod', fw='fish', w=40, h=32, radius=6, rx=11, ry=5,
      top='#3a4466', mid='#8b9bb4', belly='#c0cbdc', fin='#5a6988', tail_len=5, dorsal=0,
      pattern=cod_speckle, extra=cod_extra, front_taper=0.85, bites=False),
  'fish-bull_shark': dict(name='Bull Shark', fw='shark', w=112, h=56, radius=22, rx=34, ry=14,
      top='#733e39', mid='#b86f50', belly='#e8b796', fin='#733e39', tail_len=11, tail_spread=1.0, dorsal=8, dorsal_color='#3e2731',
      teeth=True, front_taper=0.95, eye=(0.6, -0.3), extra=bull_extra, bites=True),
  'fish-great_white': dict(name='Great White Shark', fw='shark', w=112, h=56, radius=26, rx=40, ry=14,
      top='#3a4466', mid='#5a6988', belly='#ffffff', fin='#3a4466', tail_len=13, tail_spread=1.15, dorsal=11, dorsal_color='#262b44',
      pattern=white_belly, teeth=True, front_taper=0.75, eye=(0.62, -0.32), extra=gw_extra, bites=True),
  'fish-leopard_seal': dict(name='Leopard Seal', fw='bigfish', w=80, h=48, radius=13, rx=29, ry=8,
      top='#3a4466', mid='#8b9bb4', belly='#c0cbdc', fin='#3a4466', tail_len=7, tail_spread=0.8, dorsal=0,
      pattern=seal_spots, teeth=True, front_taper=0.95, eye=(0.72, -0.4), extra=seal_extra, bites=True),
}
FW = {'fish': 2, 'bigfish': 2, 'shark': 2, 'whale': 2}
KW = ('rx','ry','top','mid','belly','fin','tail_len','tail_spread','fork','dorsal','dorsal_color','pattern','teeth','eye','front_taper','lip','spines','long_fin','extra')
out = {}
for pid, sp in SPECS.items():
    kw = {k: v for k, v in sp.items() if k in KW}
    w, h = sp['w'], sp['h']
    swim = [fish(w, h, flex=-1, **kw), fish(w, h, flex=1, **kw)]
    poses = [("idle", 3, [swim[0]]), ("move", 6, swim)]
    if sp['bites']: poses.append(("attack", 8, [fish(w, h, flex=0, bite=True, **kw)]))
    poses.append(("dead", 1, [skeleton(w, h, sp['rx'], sp['ry'], sp['tail_len'])]))
    cx = w / 2 - 0.5
    mouth = [int(cx + sp['rx'] * sp.get('front_taper', 0.85)), int(h / 2 - 0.5 + sp['ry'] * 0.25)]
    out[pid] = (sp['name'], sp['fw'], w, h, sp['radius'], mouth, poses)

# anglerfish (fish canvas), sperm whale (its own wide canvas)
aw, ah = 40, 32
out['fish-anglerfish'] = ('Anglerfish', 'fish', aw, ah, 8, [int(aw / 2 + 8), int(ah / 2 + 4)],
    [("idle", 3, [angler(aw, ah, -1)]), ("move", 5, [angler(aw, ah, -1), angler(aw, ah, 1)]),
     ("attack", 8, [angler(aw, ah, 0, bite=True)]), ("dead", 1, [skeleton(aw, ah, 9, 7, 4)])])
ww, wh = 192, 72
out['fish-sperm_whale'] = ('Sperm Whale', 'whale', ww, wh, 38, [int(ww / 2 + 66), int(wh / 2 + 17)],
    [("idle", 2, [whale(ww, wh, -1)]), ("move", 3, [whale(ww, wh, -1), whale(ww, wh, 1)]),
     ("attack", 6, [whale(ww, wh, 0, bite=True)]), ("dead", 1, [whale_skeleton(ww, wh)])])

projects = {}
for pid, (name, fw, w, h, radius, mouth, poses) in out.items():
    for pn, _, grs in poses:
        for i, gr in enumerate(grs): check_margin(gr, FW[fw], f'{pid}/{pn}/{i}')
    projects[pid] = project(name, fw, w, h, radius, mouth, poses)
    json.dump(projects[pid], open(pid + '.json', 'w'))
print('lure offset (body radii):', [round(ANGLER_LURE[0] / 8, 3), round(ANGLER_LURE[1] / 8, 3)])

rows = [[frame_img(p, f, k=4) for po in p['poses'] for f in po['frames']] for p in projects.values()]
W = max(sum(i.width + 8 for i in r) for r in rows); H = sum(max(i.height for i in r) + 8 for r in rows)
sheet = Image.new('RGB', (W, H), (10, 20, 30)); y = 0
for r in rows:
    x = 0
    for i in r: sheet.paste(i, (x, y)); x += i.width + 8
    y += max(i.height for i in r) + 8
sheet.save('more_all.png'); print('ok', sheet.size)
