# Fang, the fourth playable hero: a pixel-art great white from a sheet of four poses
# (idle, swim, attack, hurt) in fang_sheet.jpg. This script samples each pose down to its
# art pixels, maps every pixel to an 8-color palette, turns the poses to face right like the
# other heroes, and writes the three Sprite Studio designs (one per stage, same art).
# Run from this folder:  python3 convert_fang.py   -> fang-*.json + fang_preview.png
import os, json
from collections import deque
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, 'fang_sheet.jpg')
# Each pose's rows in the sheet (the labels under them are left out).
BANDS = [('idle', 34, 287), ('swim', 355, 614), ('attack', 711, 969), ('hurt', 1066, 1308)]
X0, X1 = 40, 720
SCALE = 92 / (702 - 60 + 1)  # the widest pose becomes 92 art pixels long
# Colors as sampled from the sheet (used to match each pixel)...
SAMPLED = ['#0c0c10',  # 0 outline
           '#2a2a32',  # 1 dark shade (fins, gills)
           '#444854',  # 2 grey back
           '#666a73',  # 3 mid grey
           '#848a91',  # 4 light belly
           '#ebecec',  # 5 teeth
           '#a8323c',  # 6 blood (hurt)
           '#4a1f26']  # 7 inside of the mouth
P = np.array([[int(c[i:i + 2], 16) for i in (1, 3, 5)] for c in SAMPLED], float)
# ...and as saved: Endesga 32 colors, except the three neutral body greys (Fang's signature colors).
PAL = ['#181425', '#262b44', '#444854', '#666a73', '#848a91', '#ffffff', '#a22633', '#3e2731',
       '#ead4aa',  # 8 eggshell (hatchling), beige like the White Shark's
       '#c28569']  # 9 eggshell shade
SHELL, SHELL_SHADE, OUTLINE = 8, 9, 0
W, H = 100, 44


def background(sub):
    """The white paper around a pose: flood fill from the border through near-white pixels."""
    h, w, _ = sub.shape
    light = sub.min(2) > 225
    bg = np.zeros((h, w), bool)
    q = deque((y, x) for y in range(h) for x in (0, w - 1) if light[y, x])
    q.extend((y, x) for x in range(w) for y in (0, h - 1) if light[y, x])
    for y, x in q:
        bg[y, x] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and light[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def sample(sub, bg):
    """Shrink a pose to art pixels: each one takes the median color of the sheet pixels under it."""
    h, w, _ = sub.shape
    ow, oh = round(w * SCALE), round(h * SCALE)
    grid = np.full((oh, ow), -1, int)
    for oy in range(oh):
        for ox in range(ow):
            ys = slice(int(oy / SCALE), max(int(oy / SCALE) + 1, int((oy + 1) / SCALE)))
            xs = slice(int(ox / SCALE), max(int(ox / SCALE) + 1, int((ox + 1) / SCALE)))
            m = ~bg[ys, xs]
            if m.mean() <= 0.45:
                continue
            c = np.median(sub[ys, xs][m], 0)
            if c[0] > c[1] + 35 and c[0] > c[2] + 25:
                grid[oy, ox] = 6 if c[0] > 100 else 7
            else:
                grid[oy, ox] = int(((P[:6] - c) ** 2).sum(1).argmin())
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
    # The head: the columns a little behind the snout; the cap sits on the highest one.
    head = [x for x in range(snout - 22, snout - 10) if (c[:, x] >= 0).any()]
    top = min(int(np.where(c[:, x] >= 0)[0].min()) for x in head)
    cx = head[len(head) // 2]
    cap = ['..KKKKK..',
           '.KSSSSSK.',
           'KSSSSSSsK',
           'KSsSsSssK',
           'K.K.K.K.K']
    code = {'K': OUTLINE, 'S': SHELL, 's': SHELL_SHADE}
    for dy, row in enumerate(cap):
        for dx, ch in enumerate(row):
            y, x = top - len(cap) + 2 + dy, cx - len(row) // 2 + dx
            if ch in code and 0 <= y < H and 0 <= x < W:
                c[y, x] = code[ch]
    return c


def enc(c):
    return ''.join('.' if v < 0 else str(v) for v in c.flatten())


def main():
    A = np.array(Image.open(SHEET).convert('RGB')).astype(int)
    poses = {}
    for name, y0, y1 in BANDS:
        sub = A[y0:y1, X0:X1]
        g = sample(sub, background(sub))
        poses[name] = g if name == 'hurt' else g[:, ::-1]  # face right like the other heroes
    idle = place(poses['idle'])
    snout = int(np.where((idle >= 0).any(0))[0].max()) + 1  # the snout stays put while it swims and bites
    canv = {n: place(g) if n == 'hurt' else place(g, snout) for n, g in poses.items()}
    ys, xs = np.where(canv['idle'] == 5)
    mouth = [int(round(xs.mean())) + 2, int(round(ys.mean()))]
    empty = '.' * (W * H)
    stage_names = {'hatchling': 'Fang 1: Hatchling', 'juvenile': 'Fang 2: Juvenile', 'adult': 'Fang 3: Adult'}
    for stage, title in stage_names.items():
        look = {n: eggshell(v) for n, v in canv.items()} if stage == 'hatchling' else canv
        project = {
            'name': title, 'w': W, 'h': H, 'palette': PAL, 'framework': 'fang',
            'bodyRadius': 14, 'mouth': mouth, 'pixelScale': 2,
            'poses': [
                {'name': 'idle', 'fps': 3, 'frames': [enc(look['idle'])]},
                {'name': 'move', 'fps': 5, 'frames': [enc(look['idle']), enc(look['swim'])]},
                {'name': 'attack', 'fps': 10, 'frames': [enc(look['attack'])]},
                {'name': 'damage', 'fps': 6, 'frames': [enc(look['hurt'])]},
                {'name': 'celebrate', 'fps': 6, 'frames': [enc(look['attack']), enc(look['idle'])]},
                {'name': 'rest', 'fps': 2, 'frames': [enc(look['idle'])]},
            ],
            'updatedAt': '2026-11-21T12:00:00.000Z', 'seedVersion': 3,
        }
        with open(os.path.join(HERE, f'fang-{stage}.json'), 'w') as f:
            json.dump(project, f)
    # Preview: the four poses on water blue, 4x.
    shown = [canv['idle'], canv['swim'], canv['attack'], canv['hurt'], eggshell(canv['idle']), eggshell(canv['hurt'])]
    sheet = Image.new('RGB', (W * 4, (H * 4 + 8) * len(shown)), (30, 80, 130))
    for i, frame in enumerate(shown):
        rgb = np.zeros((H, W, 3), np.uint8)
        rgb[:] = (30, 80, 130)
        for k, col in enumerate(PAL):
            rgb[frame == k] = [int(col[j:j + 2], 16) for j in (1, 3, 5)]
        sheet.paste(Image.fromarray(rgb).resize((W * 4, H * 4), Image.NEAREST), (0, i * (H * 4 + 8)))
    sheet.save(os.path.join(HERE, 'fang_preview.png'))
    print('mouth', mouth)


if __name__ == '__main__':
    main()
