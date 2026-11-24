# Bosses (run from tools/fish: python3 draw_boss.py): the Electric Eel (first boss, Spring Cave).
# Same framework rules as draw_fish.py: body center = canvas center, facing right, Endesga 32 colors.
# Real look: a long, round, dark olive-grey body with an orange-yellow throat and belly, a flat head with tiny eyes,
# no back fin, and one long rippling fin running under the body (it is a knifefish, not a true eel).
import json, math, sys
sys.argv = sys.argv[:1]
from draw_fish import Grid, skeleton, project, check_margin, OUT, EYE_W, PUPIL, MOUTH, frame_img
from PIL import Image

BACK, SIDE, LIGHT, BELLY, THROAT, FIN = '#262b44', '#3a4466', '#5a6988', '#feae34', '#f77622', '#8b9bb4'
SPARK = '#fee761'

def eel(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    x0, x1 = cx - 34, cx + 30          # tail tip .. snout
    def wave(x):
        u = min(1.0, max(0.0, (x - x0) / (x1 - x0)))
        return cy + 3.2 * math.sin((x - x0) * 0.11 + phase) * (1 - u) ** 1.4
    def half(x):
        u = min(1.0, max(0.0, (x - x0) / (x1 - x0)))
        return 1.2 + 6.2 * min(1, u / 0.55) ** 0.8 if u < 0.92 else 7.4 - (u - 0.92) / 0.08 * 3.2
    # the long anal fin under the body, rippling
    for x in range(int(x0 + 4), int(x1 - 14)):
        c = wave(x) + half(x)
        rip = 1.6 + 1.2 * math.sin(x * 0.55 + phase * 2)
        for k in range(1, int(rip) + 2): g.px(x, c + k, FIN if k > 1 else LIGHT)
    for x in range(int(x0), int(x1) + 1):
        c, hh = wave(x), half(x)
        for y in range(int(c - hh), int(c + hh) + 1):
            t = (y - c) / max(1, hh)
            u = (x - x0) / (x1 - x0)
            col = BACK if t < -0.35 else SIDE if t < 0.25 else LIGHT
            if t > 0.45 and u > 0.45: col = THROAT if u > 0.8 else BELLY        # orange throat and belly
            if -0.2 < t < 0.2 and int(x) % 6 == 0 and u < 0.85: col = BACK     # faint rings of the electric organs
            g.px(x, y, col)
    # flat head: tiny eye, a wide mouth line
    hy = wave(x1)
    g.px(x1 - 6, hy - 3, EYE_W); g.px(x1 - 5, hy - 3, PUPIL)
    gape = 3 if bite else 0
    for x in range(int(x1 - 9), int(x1) + 1):
        g.px(x, hy + 1, MOUTH)
        for k in range(gape): g.px(x, hy + 2 + k, MOUTH)
    if bite:
        for x in range(int(x1 - 8), int(x1), 2): g.px(x, hy + 1, EYE_W)
    g.outline()
    return g

def charged(src):
    """The same frame crackling with electricity (the shock warning): a yellow outline and sparks."""
    g = Grid(src.w, src.h)
    for y in range(src.h):
        for x in range(src.w):
            c = src.g[y][x]
            g.g[y][x] = SPARK if c == OUT else c
    for k in range(14):
        x = 4 + (k * 37) % (src.w - 8); y = 6 + (k * 23) % (src.h - 12)
        if src.g[y][x] is None:
            g.px(x, y, SPARK); g.px(x + 1, y - 1, '#ffffff')
    return g

FW = {'bigfish': 2}
ew, eh = 80, 48
swim = [eel(ew, eh, p) for p in (0.0, 1.6, 3.2, 4.8)]
poses = [("idle", 3, [swim[0]]), ("move", 6, swim), ("attack", 8, [eel(ew, eh, 1.0, bite=True)]),
         ("celebrate", 10, [charged(swim[0]), swim[0], charged(swim[2])]), ("dead", 1, [skeleton(ew, eh, 31, 4, 3)])]
out = {'beast-electric_eel': ('Electric Eel', 'bigfish', ew, eh, 13, [int(ew / 2 - 0.5 + 30), int(eh / 2 + 1)], poses)}

if __name__ == '__main__':
    projects = {}
    for pid, (name, fw, w, h, radius, mouth, ps) in out.items():
        for pn, _, grs in ps:
            for i, gr in enumerate(grs): check_margin(gr, FW[fw], f'{pid}/{pn}/{i}')
        projects[pid] = project(name, fw, w, h, radius, mouth, ps)
        json.dump(projects[pid], open(pid + '.json', 'w'))
    rows = [[frame_img(p, f, k=4) for po in p['poses'] for f in po['frames']] for p in projects.values()]
    W = max(sum(i.width + 8 for i in r) for r in rows); H = sum(max(i.height for i in r) + 8 for r in rows)
    sheet = Image.new('RGB', (W, H), (10, 20, 30)); y = 0
    for r in rows:
        x = 0
        for i in r: sheet.paste(i, (x, y)); x += i.width + 8
        y += max(i.height for i in r) + 8
    sheet.save('boss_all.png'); print('ok', sheet.size)
