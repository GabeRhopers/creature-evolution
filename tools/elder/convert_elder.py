# Elder Croc, the fifth playable hero: a pixel-art crocodile from a sheet of poses (idle, walk, bite, hurt) in
# elder_sheet.jpg. This script finds each pose on the sheet (connected shapes on the navy background; labels and
# stray bits are skipped), samples it down to art pixels, maps every pixel to the palette, turns the poses to face
# right like the other heroes, and writes the three Sprite Studio designs (one per stage, same art; the hatchling
# wears an eggshell cap). Run from this folder:  python3 convert_elder.py   -> elder_croc-*.json + elder_preview.png
#
# How the sheet maps to the game:
#   walk (3 frames)  -> swim ("move"), the first walk frame is also the still pose ("idle", "rest")
#   bite (3 frames)  -> the bite sequence ("attack")
#   idle (3 frames)  -> standing up and roaring: the level-up cheer ("celebrate")
#   hurt (1st frame) -> the hurt flash ("damage")
import os, json
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'elder_sheet.jpg')
BG = np.array([35, 49, 84])
SCALE = 0.25            # sheet pixels -> art pixels (the long poses come out about 88 px)
W, H = 100, 56
# Colors as sampled from the sheet, and what each one is saved as (Endesga 32, plus three signature colors:
# the bright lime body, the pale belly and the pink inside of the mouth).
SAMPLED = ['#0a120f', '#5a273a', '#386039', '#547e55', '#7ba65a', '#b6636b', '#a2af75', '#b5e86c', '#c9e092', '#f0ebee']
SAVED = ['#181425', '#3e2731', '#265c42', '#3e8948', '#63c74d', '#b6636b', '#63c74d', '#b5e86c', '#c9e092', '#ffffff']
PAL = list(dict.fromkeys(SAVED)) + ['#ead4aa', '#c28569']        # + eggshell and its shade (hatchling)
P = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in SAMPLED], float)
SHELL, SHELL_SHADE, OUTLINE = PAL.index('#ead4aa'), PAL.index('#c28569'), PAL.index('#181425')


def shapes():
    """The poses on the sheet, top to bottom (big shapes only), each as (crop, mask)."""
    A = np.array(Image.open(SHEET).convert('RGB')).astype(int)
    mask = np.abs(A - BG).sum(2) > 70
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    out = []
    for i in range(n):
        sl = objs[i]
        h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if sizes[i] < 15000 or h < 60:   # labels (IDLE, WALK...) and the stray tail bits
            continue
        out.append((sl[0].start, sl[1].start, A[sl], lab[sl] == i + 1))
    out.sort(key=lambda t: (t[0] // 40, t[1]))
    return [(a, m) for _, _, a, m in out]


def sample(a, m):
    """Shrink a pose to art pixels: each one takes the median color of the sheet pixels under it."""
    h, w = m.shape
    oh, ow = max(1, round(h * SCALE)), max(1, round(w * SCALE))
    grid = np.full((oh, ow), -1, int)
    for oy in range(oh):
        for ox in range(ow):
            ys = slice(int(oy / SCALE), max(int(oy / SCALE) + 1, int((oy + 1) / SCALE)))
            xs = slice(int(ox / SCALE), max(int(ox / SCALE) + 1, int((ox + 1) / SCALE)))
            mm = m[ys, xs]
            if mm.mean() <= 0.4:
                continue
            c = np.median(a[ys, xs][mm], 0)
            grid[oy, ox] = PAL.index(SAVED[int(((P - c) ** 2).sum(1).argmin())])
    ys, xs = np.where(grid >= 0)
    return grid[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def place(g, right=None):
    c = np.full((H, W), -1, int)
    h, w = g.shape
    x0 = (W - w) // 2 if right is None else right - w
    y0 = (H - h) // 2
    c[y0:y0 + h, x0:x0 + w] = g
    return c


def eggshell(c):
    """The hatchling: a cap of broken eggshell on its head, like the other heroes' hatchlings."""
    c = c.copy()
    cols = np.where((c >= 0).any(0))[0]
    snout = cols.max()
    head = [x for x in range(snout - 30, snout - 16) if (c[:, x] >= 0).any()]
    top = min(int(np.where(c[:, x] >= 0)[0].min()) for x in head)
    cx = head[len(head) // 2]
    cap = ['..KKKKK..', '.KSSSSSK.', 'KSSSSSSsK', 'KSsSsSssK', 'K.K.K.K.K']
    code = {'K': OUTLINE, 'S': SHELL, 's': SHELL_SHADE}
    for dy, row in enumerate(cap):
        for dx, ch in enumerate(row):
            y, x = top - len(cap) + 2 + dy, cx - len(row) // 2 + dx
            if ch in code and 2 <= y < H - 2 and 2 <= x < W - 2:
                c[y, x] = code[ch]
    return c


def enc(c):
    return ''.join('.' if v < 0 else '0123456789ABCDEFGHIJ'[v] for v in c.flatten())


def main():
    s = shapes()
    assert len(s) == 11, f'expected 11 poses on the sheet, found {len(s)}'
    g = [sample(a, m) for a, m in s]
    idle, walk, bite, hurt = [f[:, ::-1] for f in g[0:3]], g[3:6], g[6:9], g[9]   # the standing poses face left on the sheet
    walk = [walk[0], walk[1][:, ::-1], walk[2][:, ::-1]]      # the 2nd and 3rd walk frames face left on the sheet
    swim0 = place(walk[0])
    snout = int(np.where((swim0 >= 0).any(0))[0].max()) + 1  # the snout stays put while it swims and bites
    swim = [place(f, snout) for f in walk]
    bites = [place(f, snout) for f in bite]
    stand = [place(f) for f in idle]
    hurt = place(hurt)
    ys, xs = np.where(bites[0] == PAL.index('#b6636b'))
    mouth = [int(round(xs.mean())) + 2, int(round(ys.mean()))]
    for stage, title in (('hatchling', 'Elder Croc 1: Hatchling'), ('juvenile', 'Elder Croc 2: Juvenile'), ('adult', 'Elder Croc 3: Adult')):
        f = (lambda c: eggshell(c)) if stage == 'hatchling' else (lambda c: c)
        project = {
            'name': title, 'w': W, 'h': H, 'palette': PAL, 'framework': 'elder_croc',
            'bodyRadius': 14, 'mouth': mouth, 'pixelScale': 2,
            'poses': [
                {'name': 'idle', 'fps': 3, 'frames': [enc(f(swim[0]))]},
                {'name': 'move', 'fps': 6, 'frames': [enc(f(x)) for x in swim]},
                {'name': 'attack', 'fps': 10, 'frames': [enc(f(x)) for x in bites]},
                {'name': 'damage', 'fps': 6, 'frames': [enc(f(hurt))]},
                {'name': 'celebrate', 'fps': 5, 'frames': [enc(f(x)) for x in stand]},
                {'name': 'rest', 'fps': 2, 'frames': [enc(f(swim[0]))]},
            ],
            'updatedAt': '2026-11-21T12:00:00.000Z', 'seedVersion': 3,
        }
        with open(os.path.join(HERE, f'elder_croc-{stage}.json'), 'w') as fh:
            json.dump(project, fh)
    shown = swim + bites + stand + [hurt, eggshell(swim[0])]
    sheet = Image.new('RGB', (W * 4 * 3, (H * 4 + 8) * 5), (35, 49, 84))
    for i, frame in enumerate(shown):
        rgb = np.zeros((H, W, 3), np.uint8)
        rgb[:] = (30, 60, 110)
        for k, col in enumerate(PAL):
            rgb[frame == k] = [int(col[j:j + 2], 16) for j in (1, 3, 5)]
        sheet.paste(Image.fromarray(rgb).resize((W * 4, H * 4), Image.NEAREST), ((i % 3) * W * 4, (i // 3) * (H * 4 + 8)))
    sheet.save(os.path.join(HERE, 'elder_preview.png'))
    print('mouth', mouth, [x.shape for x in g])


if __name__ == '__main__':
    main()
