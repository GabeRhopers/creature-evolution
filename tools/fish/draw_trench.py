# Twilight Trench creatures (run from tools/fish: python3 draw_trench.py):
# Lanternfish, Viperfish, Gulper Eel and Vampire Squid.
# Same framework rules as draw_fish.py: body center = canvas center, facing right, Endesga 32 colors.
import json, math
from draw_fish import Grid, fish, skeleton, project, check_margin, OUT, EYE_W, PUPIL, MOUTH, frame_img
from draw_beasts import ellipse, thick_line
from PIL import Image

CYAN, WHITE, NAVY, SLATE, GREY, STONE = '#2ce8f5', '#ffffff', '#262b44', '#3a4466', '#5a6988', '#8b9bb4'

# ------------------------------------------------------------------ lanternfish (small, rows of glowing dots on the belly)
def lantern_dots(x, y, cx, cy, rx, ry, col):
    t, u = (y - cy) / ry, (x - cx) / rx
    if 0.35 < t < 0.75 and int(x) % 2 == 0 and -0.8 < u < 0.6: return CYAN   # photophores along the belly
    return col

def lantern_extra(g, cx, cy, bite):
    # a big eye (it lives in the dim light) and a glowing spot on the nose
    g.px(cx + 5, cy - 2, EYE_W); g.px(cx + 6, cy - 2, EYE_W); g.px(cx + 6, cy - 1, PUPIL); g.px(cx + 5, cy - 1, EYE_W)
    g.px(cx + 8, cy - 1, CYAN)

# ------------------------------------------------------------------ viperfish (long fangs that don't fit in its mouth, a lure on its back)
VIPER_RX, VIPER_RY = 26, 6
def viper_pattern(x, y, cx, cy, rx, ry, col):
    t, u = (y - cy) / ry, (x - cx) / rx
    if t > 0.5 and int(x) % 3 == 0 and -0.9 < u < 0.7: return CYAN            # a row of lights under the belly
    return col

VIPER_LURE = (14, -12)   # the glowing tip of the long first ray of its dorsal fin
def viper_extra(g, cx, cy, bite):
    # the long dorsal ray arching forward over the head, with a glowing tip
    for k in range(9):
        g.px(cx + 4 + k * 1.2, cy - VIPER_RY - 1 - math.sin(k / 8 * math.pi) * 5 - k * 0.15, GREY)
    g.px(cx + VIPER_LURE[0], cy + VIPER_LURE[1] + 1, CYAN); g.px(cx + VIPER_LURE[0] + 1, cy + VIPER_LURE[1] + 1, WHITE)
    g.px(cx + VIPER_LURE[0], cy + VIPER_LURE[1] + 2, CYAN)
    # huge eye, and the fangs: two long needles from the lower jaw past the snout, two from the top
    ex = cx + VIPER_RX * 0.62
    g.px(ex, cy - 2, EYE_W); g.px(ex + 1, cy - 2, EYE_W); g.px(ex + 1, cy - 1, PUPIL); g.px(ex, cy - 1, EYE_W)
    jaw = cx + VIPER_RX * 0.8
    gape = 3 if bite else 0
    for i in range(6): g.px(jaw + 1 + i * 0.3, cy + 3 + gape - i, WHITE)
    for i in range(5): g.px(jaw + 4 + i * 0.3, cy + 3 + gape - i, WHITE)
    for i in range(4): g.px(jaw - 1, cy - 1 + i, WHITE)

# ------------------------------------------------------------------ gulper eel (a giant mouth on a thin whip of a body)
def gulper(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    hx = cx + 14                     # the head (all mouth)
    # the whip tail: long and thin, waving, a pink light at the tip
    x0, x1 = cx - 34, hx - 6
    def wave(x):
        u = (x - x0) / (x1 - x0)
        return cy + 3 * math.sin((x - x0) * 0.18 + phase) * (1 - u)
    for x in range(int(x0), int(x1) + 1):
        u = (x - x0) / (x1 - x0)
        r = 0.5 + 2.2 * u
        for yy in range(int(wave(x) - r), int(wave(x) + r) + 1): g.px(x, yy, NAVY if yy < wave(x) else SLATE)
    g.px(x0 - 1, wave(x0), '#f6757a'); g.px(x0 - 2, wave(x0), '#b55088')
    # the head: a little skull with a tiny eye at the very front, and a huge pouch of a jaw hanging below
    gape = 1.6 if bite else 1.0
    ellipse(g, hx, cy - 2, 6, 4, lambda x, y: NAVY if y < cy - 3 else SLATE)
    ellipse(g, hx + 2, cy + 3 * gape, 9, 5 * gape, lambda x, y: MOUTH if ((x - (hx + 3)) / 7) ** 2 + ((y - (cy + 3 * gape)) / (3.6 * gape)) ** 2 <= 1 else SLATE)
    for x in range(int(hx - 5), int(hx + 11)): g.px(x, cy - 0.5 + (0 if not bite else -1), GREY)   # upper jaw line
    g.px(hx + 4, cy - 3, EYE_W); g.px(hx + 5, cy - 3, PUPIL)
    g.outline()
    return g

# ------------------------------------------------------------------ vampire squid (a dark red cloak, huge blue eyes, glowing arm tips)
def vampire(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    open_ = 1.5 if bite else 1.0      # 'bite' frame = the scared, cloak-flared pose
    # the webbed cloak trailing behind (eight arms joined by skin), wavy
    for i, a in enumerate((-0.5, -0.25, 0.0, 0.25, 0.5)):
        pts, wid = [], []
        x, y, ang = cx - 2, cy + a * 4, math.pi + a * 0.9 * open_
        for k in range(6):
            pts.append((x, y)); wid.append(max(1, 5 - k * 0.7))
            ang += 0.06 * math.sin(phase + k * 0.7 + i)
            x += math.cos(ang) * 2.3; y += math.sin(ang) * 2.3
        thick_line(g, pts, wid, ['#68386c'] * 2 + ['#a22633'] * 4)
        g.px(pts[-1][0] - 1, pts[-1][1], CYAN)                      # glowing arm tips
    # the mantle: a rounded red-black bell with two ear-like fins
    ellipse(g, cx + 7, cy, 8, 6, lambda x, y: '#3e2731' if y < cy - 3 else '#a22633')
    for s in (-1, 1):
        for i in range(3): g.px(cx + 9 + i, cy + s * (6 + i * 0.6), '#a22633')
    # the eyes: the biggest for its size in the animal kingdom, pale blue
    ellipse(g, cx + 6, cy + 1, 2.4, 2.4, lambda x, y: '#0099db')
    g.px(cx + 6, cy + 1, PUPIL); g.px(cx + 5, cy, EYE_W)
    g.outline('#181425')
    return g

# ------------------------------------------------------------------ build
FW = {'fish': 2, 'bigfish': 2, 'shark': 2}
out = {}
# lanternfish: a small fish canvas
lk = dict(rx=8, ry=4, top=NAVY, mid=SLATE, belly=STONE, fin=GREY, tail_len=4, dorsal=1, dorsal_color=NAVY, pattern=lantern_dots, extra=lantern_extra, front_taper=0.85, eye=(0.65, -0.5))
lw, lh = 40, 32
out['fish-lanternfish'] = ('Lanternfish', 'fish', lw, lh, 4, [int(lw / 2 - 0.5 + 8 * 0.85), int(lh / 2)],
    [("idle", 3, [fish(lw, lh, flex=-1, **lk)]), ("move", 7, [fish(lw, lh, flex=-1, **lk), fish(lw, lh, flex=1, **lk)]),
     ("dead", 1, [skeleton(lw, lh, 8, 4, 4)])])
# viperfish: a long thin body on the bigfish canvas
vk = dict(rx=VIPER_RX, ry=VIPER_RY, top=NAVY, mid=SLATE, belly=GREY, fin=NAVY, tail_len=6, tail_spread=0.7, dorsal=0,
          pattern=viper_pattern, extra=viper_extra, front_taper=0.95, eye=(0.62, -0.3))
vw, vh = 80, 48
out['fish-viperfish'] = ('Viperfish', 'bigfish', vw, vh, 10, [int(vw / 2 - 0.5 + VIPER_RX * 0.95), int(vh / 2 + 2)],
    [("idle", 3, [fish(vw, vh, flex=-1, **vk)]), ("move", 6, [fish(vw, vh, flex=-1, **vk), fish(vw, vh, flex=1, **vk)]),
     ("attack", 8, [fish(vw, vh, flex=0, bite=True, **vk)]), ("dead", 1, [skeleton(vw, vh, VIPER_RX, VIPER_RY, 6)])])
gw, gh = 80, 48
out['beast-gulper_eel'] = ('Gulper Eel', 'bigfish', gw, gh, 12, [int(gw / 2 - 0.5 + 25), int(gh / 2 + 3)],
    [("idle", 3, [gulper(gw, gh, 0.0)]), ("move", 5, [gulper(gw, gh, p) for p in (0.0, 1.6, 3.2, 4.8)]),
     ("attack", 8, [gulper(gw, gh, 1.0, bite=True)]), ("dead", 1, [skeleton(gw, gh, 28, 3, 2)])])
sw, sh = 40, 32
out['beast-vampire_squid'] = ('Vampire Squid', 'fish', sw, sh, 7, [int(sw / 2 - 0.5 + 14), int(sh / 2)],
    [("idle", 3, [vampire(sw, sh, 0.0)]), ("move", 4, [vampire(sw, sh, p) for p in (0.0, 2.1, 4.2)]),
     ("attack", 6, [vampire(sw, sh, 1.0, bite=True)])])

if __name__ == '__main__':
    projects = {}
    for pid, (name, fw, w, h, radius, mouth, poses) in out.items():
        for pn, _, grs in poses:
            for i, gr in enumerate(grs): check_margin(gr, FW[fw], f'{pid}/{pn}/{i}')
        projects[pid] = project(name, fw, w, h, radius, mouth, poses)
        json.dump(projects[pid], open(pid + '.json', 'w'))
    print('viperfish lure (body radii):', [round(VIPER_LURE[0] / 10, 3), round((VIPER_LURE[1] + 1.5) / 10, 3)])
    rows = [[frame_img(p, f, k=4) for po in p['poses'] for f in po['frames']] for p in projects.values()]
    W = max(sum(i.width + 8 for i in r) for r in rows); H = sum(max(i.height for i in r) + 8 for r in rows)
    sheet = Image.new('RGB', (W, H), (10, 20, 30)); y = 0
    for r in rows:
        x = 0
        for i in r: sheet.paste(i, (x, y)); x += i.width + 8
        y += max(i.height for i in r) + 8
    sheet.save('trench_all.png'); print('ok', sheet.size)
