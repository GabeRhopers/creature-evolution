# Kelp Forest creatures (run from tools/fish: python3 draw_kelp.py): Garibaldi, California Sheephead, Purple Sea Urchin,
# Sea Otter and California Sea Lion.
# Same framework rules as draw_fish.py: body center = canvas center, facing right, Endesga 32 colors.
import json, math, sys
sys.argv = sys.argv[:1]
from draw_fish import Grid, fish, skeleton, project, check_margin, OUT, EYE_W, PUPIL, MOUTH, frame_img
from PIL import Image


def ellipse(g, cx, cy, rx, ry, color_at):
    for y in range(int(cy - ry - 1), int(cy + ry + 2)):
        for x in range(int(cx - rx - 1), int(cx + rx + 2)):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1:
                c = color_at(x, y)
                if c: g.px(x, y, c)


# ------------------------------------------------------------------ garibaldi (a bright orange damselfish, round and bold)
def garibaldi_extra(g, cx, cy, bite):
    for i in range(4): g.px(cx - 3 + i, cy - 6 - (1 if i in (1, 2) else 0), '#f77622')   # tall rounded dorsal


# ------------------------------------------------------------------ sheephead (black head and tail, red middle, white chin, buck teeth)
SHEEP_RX, SHEEP_RY = 16, 7
def sheep_pattern(x, y, cx, cy, rx, ry, col):
    if x > cx + rx * 0.42:
        return '#ffffff' if y > cy + ry * 0.25 else '#262b44'      # black head, white chin
    if x < cx - rx * 0.5: return '#262b44'                          # black tail end
    return col

def sheep_extra(g, cx, cy, bite):
    front = cx + SHEEP_RX * 0.9
    g.px(front, cy + 1, '#ffffff'); g.px(front, cy + 2, '#ffffff')  # the big front teeth (they crunch urchins)
    for x in range(int(cx - 6), int(cx + 6)): g.px(x, cy - SHEEP_RY - 1, '#a22633')   # long red dorsal


# ------------------------------------------------------------------ purple sea urchin (a spiny ball that creeps over the rocks)
def urchin(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    r = 5.5
    for k in range(18):                                     # spines all around, swaying a little
        a = k / 18 * 2 * math.pi + math.sin(phase + k) * 0.08
        ln = 5 + (k % 3)
        for d in range(int(r), int(r + ln)):
            g.px(cx + math.cos(a) * d, cy + math.sin(a) * d * 0.9, '#68386c' if d < r + ln - 1 else '#b55088')
    ellipse(g, cx, cy, r, r * 0.9, lambda x, y: '#b55088' if (x - cx) + (y - cy) < -2 else '#68386c')
    for k in range(5):                                      # tube feet underneath
        g.px(cx - 3 + k * 1.5, cy + r * 0.9 + 1 + (k + int(phase)) % 2, '#f6757a')
    g.outline('#3e2731')
    return g


# ------------------------------------------------------------------ sea otter (long furry body, pale face, whiskers, webbed feet)
def otter(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    fur, dark, face = '#733e39', '#3e2731', '#e4a672'
    kick = math.sin(phase)
    for i in range(9):                                      # thick tail, flat at the end
        for j in range(3): g.px(cx - 16 - i, cy + 1 + kick * i * 0.15 + j - 1, fur if j else dark)
    for i in range(5):                                      # webbed hind feet kicking
        for j in range(3): g.px(cx - 13 - i * 0.5 + j, cy + 5 + i * (0.7 + 0.2 * kick), dark)
    ellipse(g, cx - 2, cy, 15, 5.5, lambda x, y: dark if (x * 5 + y * 3) % 13 == 0 else fur)   # the body
    hx = cx + 14                                            # the head: pale face, round
    ellipse(g, hx, cy - 2, 5, 4.2, lambda x, y: face if x > hx - 2 else fur)
    g.px(hx - 2, cy - 6, fur); g.px(hx - 1, cy - 6, fur)    # small ear
    g.px(hx + 2, cy - 3, OUT)                               # eye
    g.px(hx + 5, cy - 2, OUT)                               # nose
    for k in range(3): g.px(hx + 6, cy - 1 + k, '#ffffff')  # whiskers
    if bite:
        for x in range(int(hx + 1), int(hx + 5)): g.px(x, cy + 1, MOUTH)
    for i in range(4):                                      # front paws held under the chest
        g.px(cx + 8 - i * 0.3, cy + 5 + i * (0.5 + 0.3 * kick), dark)
    g.outline()
    return g


# ------------------------------------------------------------------ california sea lion (sleek brown, ear flaps, big front flippers)
LION_RX, LION_RY = 27, 8
def lion_extra(g, cx, cy, bite):
    for i in range(9):                                      # big front flipper, swept back
        for j in range(3): g.px(cx + 8 - i * 0.9, cy + 6 + i * 0.6 + j * 0.6, '#3e2731' if j == 2 else '#733e39')
    front = cx + LION_RX * 0.95
    g.px(front - 7, cy - 6, '#3e2731'); g.px(front - 7, cy - 5, '#3e2731')   # the little ear flap
    g.px(front - 1, cy - 1, '#ffffff'); g.px(front - 2, cy - 2, '#ffffff')   # whiskers
    g.px(front, cy - 3, OUT)                                                  # nostril


# ------------------------------------------------------------------ build
FW = {'fish': 2, 'bigfish': 2, 'shark': 2}
out = {}
def swimmer(pid, name, fw, w, h, radius, kw, bites=True, fps=6, dead=True):
    sw = [fish(w, h, flex=-1, **kw), fish(w, h, flex=1, **kw)]
    poses = [("idle", 3, [sw[0]]), ("move", fps, sw)]
    if bites: poses.append(("attack", 8, [fish(w, h, flex=0, bite=True, **kw)]))
    if dead: poses.append(("dead", 1, [skeleton(w, h, kw['rx'], kw['ry'], kw['tail_len'])]))
    cx = w / 2 - 0.5
    out[pid] = (name, fw, w, h, radius, [int(cx + kw['rx'] * kw.get('front_taper', 0.85)), int(h / 2 - 0.5 + kw['ry'] * 0.25)], poses)

swimmer('fish-garibaldi', 'Garibaldi', 'fish', 40, 32, 5, dict(rx=8, ry=6, top='#f77622', mid='#f77622', belly='#feae34', fin='#f77622', tail_len=4,
        tail_spread=0.8, dorsal=0, extra=garibaldi_extra, front_taper=0.9, eye=(0.55, -0.3)), fps=5)
swimmer('fish-sheephead', 'California Sheephead', 'bigfish', 80, 48, 9, dict(rx=SHEEP_RX, ry=SHEEP_RY, top='#a22633', mid='#e43b44', belly='#f6757a', fin='#262b44',
        tail_len=6, tail_spread=0.7, fork=False, dorsal=0, pattern=sheep_pattern, extra=sheep_extra, front_taper=0.9, eye=(0.65, -0.3)))
uw, uh = 40, 32
out['beast-sea_urchin'] = ('Purple Sea Urchin', 'fish', uw, uh, 6, [int(uw / 2 + 7), int(uh / 2 + 3)],
    [("idle", 2, [urchin(uw, uh, 0.0)]), ("move", 3, [urchin(uw, uh, p) for p in (0.0, 2.1, 4.2)])])
ow, oh = 80, 48
out['beast-sea_otter'] = ('Sea Otter', 'bigfish', ow, oh, 10, [int(ow / 2 - 0.5 + 19), int(oh / 2)],
    [("idle", 2, [otter(ow, oh, 0.0)]), ("move", 5, [otter(ow, oh, p) for p in (0.0, 1.6, 3.2, 4.8)]), ("attack", 6, [otter(ow, oh, 1.0, bite=True)])])
swimmer('beast-sea_lion', 'California Sea Lion', 'bigfish', 80, 48, 12, dict(rx=LION_RX, ry=LION_RY, top='#733e39', mid='#b86f50', belly='#e4a672', fin='#3e2731',
        tail_len=6, tail_spread=0.9, dorsal=0, teeth=True, extra=lion_extra, front_taper=0.95, eye=(0.72, -0.4)), fps=7, dead=True)

if __name__ == '__main__':
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
    sheet.save('kelp_all.png'); print('ok', sheet.size)
