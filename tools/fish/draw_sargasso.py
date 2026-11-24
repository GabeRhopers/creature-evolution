# Sargasso Drift creatures (run from tools/fish: python3 draw_sargasso.py): Flying Fish, Sargassum Fish, Mahi-mahi,
# Yellowfin Tuna, Sailfish, Green Sea Turtle and Portuguese Man o' War.
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

# ------------------------------------------------------------------ flying fish (long wing-like pectoral fins)
def flying_extra(g, cx, cy, bite):
    for i in range(9):                      # the wing, swept back from behind the head
        for j in range(2 + i // 3):
            g.px(cx + 3 - i, cy - 1 - j * 0.6 - i * 0.35, '#c0cbdc' if j else '#8b9bb4')

# ------------------------------------------------------------------ mahi-mahi (blunt forehead, back-long fin, gold and green)
def mahi_pattern(x, y, cx, cy, rx, ry, col):
    if (int(x) * 3 + int(y) * 5) % 11 == 0 and (y - cy) / ry > -0.2: return '#0099db'   # blue speckles
    return col

def mahi_extra(g, cx, cy, bite):
    for x in range(int(cx - 14), int(cx + 9)):              # one fin along the whole back
        g.px(x, cy - 7 - (1 if x % 3 else 0), '#0099db')
    for y in range(int(cy - 6), int(cy + 2)): g.px(cx + 12, y, '#3e8948')   # the steep forehead

# ------------------------------------------------------------------ yellowfin tuna (dark back, silver sides, yellow fins)
def tuna_extra(g, cx, cy, bite):
    for k in range(5):                                       # little yellow finlets toward the tail
        g.px(cx - 8 - k * 2, cy - 5 + k * 0.4, '#feae34'); g.px(cx - 8 - k * 2, cy + 5 - k * 0.4, '#feae34')
    for i in range(6): g.px(cx - 1 - i * 0.4, cy - 7 - i, '#feae34')        # tall yellow second dorsal
    for i in range(6): g.px(cx - 1 - i * 0.4, cy + 7 + i, '#feae34')        # and anal fin

def tuna_pattern(x, y, cx, cy, rx, ry, col):
    t = (y - cy) / ry
    if -0.25 < t < -0.05: return '#fee761'                    # the golden side stripe
    return col

# ------------------------------------------------------------------ sailfish (a huge sail and a spear bill)
SAIL_RX, SAIL_RY = 36, 8
def sail_extra(g, cx, cy, bite):
    for x in range(int(cx - 22), int(cx + 18)):              # the sail: tall, spotted, from head to mid back
        u = (x - (cx - 22)) / 40
        hgt = int(16 * math.sin(math.pi * min(1, u * 1.2)) + 3)
        for k in range(hgt):
            g.px(x, cy - SAIL_RY - k, '#68386c' if (x + k) % 5 == 0 else '#124e89')
    front = cx + SAIL_RX * 0.9
    for i in range(16): g.px(front + i, cy - 1 + i * 0.05, '#262b44')   # the bill
    for k in range(4):
        for y in range(int(cy - 3), int(cy + 4)):
            if (y + k) % 2 == 0: g.px(cx - 6 + k * 5, y, '#2ce8f5')       # pale blue bars

# ------------------------------------------------------------------ sargassum fish (a lumpy, frilly ambusher the color of weed)
def sargfish(w, h, flex=0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    gold, brown, dark = '#feae34', '#b86f50', '#733e39'
    for d in range(4):                                       # small fan tail
        for y in range(int(cy - 1 - d), int(cy + 2 + d)): g.px(cx - 8 - d, y + flex * d * 0.4, brown)
    ellipse(g, cx, cy, 8, 7, lambda x, y: dark if (x * 7 + y * 3) % 9 == 0 else gold if (x + y) % 4 else brown)
    for (fx, fy) in ((-4, -7), (0, -8), (4, -7), (-6, 6), (2, 7), (6, 5)):   # weedy frills
        g.px(cx + fx, cy + fy, '#3e8948'); g.px(cx + fx + 1, cy + fy - (1 if fy < 0 else -1), gold)
    for i in range(3): g.px(cx + 1 - i, cy + 4 + i, brown)               # 'hand' fins that grip the weed
    gape = 2 if bite else 1
    for x in range(int(cx + 5), int(cx + 9)):
        for k in range(gape): g.px(x, cy + 1 + k, MOUTH)
    g.px(cx + 4, cy - 3, EYE_W); g.px(cx + 5, cy - 3, PUPIL)
    g.outline()
    return g

# ------------------------------------------------------------------ green sea turtle (shell, flippers, a gentle head)
def turtle(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    flap = math.sin(phase)
    skin, skin2 = '#3e8948', '#265c42'
    hx = cx + 16                                               # head and neck
    ellipse(g, hx, cy - 1, 4.5, 3.2, lambda x, y: skin if y < cy - 1 else '#63c74d')
    g.px(hx + 1, cy - 2, EYE_W); g.px(hx + 2, cy - 2, PUPIL)
    if bite:
        for x in range(int(hx), int(hx + 5)): g.px(x, cy + 1, MOUTH)
    # the shell: brown plates outlined in gold
    ellipse(g, cx, cy - 1, 14, 8, lambda x, y: '#b86f50' if ((x - cx) // 5 + (y - cy) // 4) % 2 else '#733e39')
    for x in range(int(cx - 13), int(cx + 14)):
        if x % 5 == 0:
            for y in range(int(cy - 7), int(cy + 6)):
                if g.get(x, y) in ('#b86f50', '#733e39'): g.px(x, y, '#feae34')
    for x in range(int(cx - 13), int(cx + 14)): g.px(x, cy + 6, '#e4a672')   # pale belly plate
    # big front flippers sweeping down and back (they 'fly' through the water), small back ones
    for i in range(12):
        for j in range(3):
            g.px(cx + 9 - i * (0.55 - 0.25 * flap) + j, cy + 4 + i * (0.75 + 0.2 * flap), skin if j else skin2)
    for i in range(5):
        for j in range(2): g.px(cx - 12 - i * 0.8, cy + 4 + i * 0.5 + j, skin if j else skin2)
    g.outline()
    return g

# ------------------------------------------------------------------ Portuguese man o' war (a blue gas float with a crest, stinging tentacles)
def manowar(w, h, phase=0.0, bite=False):
    g = Grid(w, h)
    cx, cy = w / 2 - 0.5, h / 2 - 0.5
    for i, tx in enumerate((-5, -2, 1, 4)):                   # tentacles trailing back and down
        for d in range(14):
            g.px(cx + tx - d * 0.7, cy + 3 + d * 0.45 + math.sin(d * 0.6 + phase + i) * 1.2, '#68386c' if d % 3 else '#b55088')
    ellipse(g, cx + 2, cy - 1, 9, 4.5, lambda x, y: '#c0cbdc' if y > cy else '#2ce8f5' if y < cy - 2 else '#0099db')
    for x in range(int(cx - 5), int(cx + 8)):                 # the pink-edged crest (its sail)
        hgt = int(4 * math.sin(math.pi * (x - (cx - 5)) / 13)) + 1
        for k in range(hgt): g.px(x, cy - 5 - k, '#f6757a' if k == hgt - 1 else '#b55088')
    g.outline('#3a4466')
    return g

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

swimmer('fish-flying_fish', 'Flying Fish', 'fish', 40, 32, 5, dict(rx=10, ry=4, top='#124e89', mid='#0099db', belly='#c0cbdc', fin='#8b9bb4', tail_len=5,
        tail_spread=0.9, dorsal=1, extra=flying_extra, front_taper=0.8, eye=(0.6, -0.4)), bites=False, fps=8)
swimmer('fish-mahi_mahi', 'Mahi-mahi', 'bigfish', 80, 48, 11, dict(rx=18, ry=7, top='#3e8948', mid='#feae34', belly='#fee761', fin='#0099db', tail_len=8,
        tail_spread=0.9, dorsal=0, pattern=mahi_pattern, extra=mahi_extra, front_taper=1.0, eye=(0.62, -0.25), teeth=True))
swimmer('fish-yellowfin_tuna', 'Yellowfin Tuna', 'bigfish', 80, 48, 12, dict(rx=20, ry=8, top='#262b44', mid='#8b9bb4', belly='#c0cbdc', fin='#feae34', tail_len=9,
        tail_spread=1.2, dorsal=3, dorsal_color='#262b44', pattern=tuna_pattern, extra=tuna_extra, front_taper=0.8, eye=(0.62, -0.25), teeth=True))
swimmer('fish-sailfish', 'Sailfish', 'shark', 112, 56, 16, dict(rx=SAIL_RX, ry=SAIL_RY, top='#124e89', mid='#0099db', belly='#c0cbdc', fin='#124e89', tail_len=11,
        tail_spread=1.2, dorsal=0, extra=sail_extra, front_taper=0.9, eye=(0.72, -0.3)))
sw, sh = 40, 32
out['fish-sargassum_fish'] = ('Sargassum Fish', 'fish', sw, sh, 6, [int(sw / 2 - 0.5 + 8), int(sh / 2 + 1)],
    [("idle", 3, [sargfish(sw, sh, -1)]), ("move", 5, [sargfish(sw, sh, -1), sargfish(sw, sh, 1)]), ("attack", 8, [sargfish(sw, sh, 0, bite=True)]),
     ("dead", 1, [skeleton(sw, sh, 8, 6, 3)])])
tw, th = 80, 48
out['beast-green_turtle'] = ('Green Sea Turtle', 'bigfish', tw, th, 12, [int(tw / 2 - 0.5 + 20), int(th / 2)],
    [("idle", 2, [turtle(tw, th, 0.0)]), ("move", 4, [turtle(tw, th, p) for p in (0.0, 1.6, 3.2, 4.8)]), ("attack", 6, [turtle(tw, th, 1.0, bite=True)])])
mw, mh = 40, 32
out['beast-man_o_war'] = ("Man o' War", 'fish', mw, mh, 6, [int(mw / 2 + 8), int(mh / 2)],
    [("idle", 2, [manowar(mw, mh, 0.0)]), ("move", 3, [manowar(mw, mh, p) for p in (0.0, 2.1, 4.2)])])

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
    sheet.save('sargasso_all.png'); print('ok', sheet.size)
