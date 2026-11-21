# Checkpoint Crab: the mini-boss every 10 levels. A front-view cartoon crab (it scuttles sideways),
# drawn in the same style as the heroes: thick outline, two-tone red shell, white eyes on stalks,
# two big claws. A starter design: Mike can redraw it in Sprite Studio ("crab-checkpoint").
# Run from this folder:  python3 draw_crab.py   -> crab-checkpoint.json + crab_preview.png
import os, json
from heroart import OUTLINE, SPLASH, HERE, outline_around, trim, project, preview

PAL = [OUTLINE,     # 0 K outline, pupils
       '#e43b44',   # 1 R red shell
       '#a22633',   # 2 r dark red (underside, legs)
       '#f6757a',   # 3 P highlight spots
       '#ffffff',   # 4 Y eye white
       SPLASH]      # 5 F water splash
CODE = {'K': '0', 'B': '0', 'R': '1', 'r': '2', 'P': '3', 'Y': '4', 'F': '5', '.': '.'}

W, H = 40, 24


def crab(claw=1.0, legs=0, eyes=True, lift=0):
    """claw: how open the claws are (0 shut, 1 normal, 2 wide). legs: -1/0/1 leg step. lift: claws raised by pixels."""
    g = [['.'] * W for _ in range(H)]
    put = lambda x, y, c: (0 <= x < W and 0 <= y < H) and g[y].__setitem__(x, c)
    cx, cy = 20, 15
    # legs: three on each side, thin, dark; the tips step with `legs`
    for i, (bx, tx, ty) in enumerate(((13, 8, 20), (15, 10, 21), (17, 13, 22))):
        step = legs if i % 2 == 0 else -legs
        for side in (-1, 1):
            x0, x1 = cx + side * (cx - bx), cx + side * (cx - tx) + step
            for k in range(0, 9):
                t = k / 8
                put(round(x0 + (x1 - x0) * t), round(cy + 2 + (ty - cy - 2) * t), 'r')
    # shell: an oval, dark underside, light spots
    for y in range(H):
        for x in range(W):
            d = ((x + 0.5 - cx) / 10.5) ** 2 + ((y + 0.5 - cy) / 5.5) ** 2
            if d <= 1: put(x, y, 'r' if y >= cy + 2 else 'R')
    for x, y in ((15, 12), (16, 12), (23, 11), (19, 11)): put(x, y, 'P')
    # eye stalks and eyes (white with a pupil looking forward)
    for ex in (17, 23):
        for y in (9, 10): put(ex, y, 'R')
        if eyes:
            put(ex - 1, 7, 'Y'); put(ex, 7, 'Y'); put(ex - 1, 8, 'Y'); put(ex, 8, 'K')
        else:
            put(ex - 1, 7, 'B'); put(ex, 7, 'B'); put(ex - 1, 8, 'R'); put(ex, 8, 'R')   # closed: a dark lid (same spot as the eye)
    # arms up to the claws
    for side in (-1, 1):
        for k in range(0, 6):
            ax = cx + side * (9 + k)
            ay = cy - 1 - k - (lift if k > 3 else 0)
            put(ax, ay, 'R'); put(ax, ay + 1, 'R')
    # claws: round pincers with a V gap opening upward (wider when attacking)
    for side in (-1, 1):
        ccx, ccy = cx + side * 15, 5 - lift
        for y in range(H):
            for x in range(W):
                if ((x + 0.5 - ccx) / 3.6) ** 2 + ((y + 0.5 - ccy) / 3.4) ** 2 > 1: continue
                gap = claw * (ccy - y) * 0.75
                if y < ccy and abs(x + 0.5 - ccx) < gap: continue
                put(x, y, 'P' if (x, y) == (ccx - side, ccy + 1) else 'R')
    return trim(outline_around(g, 'RrPY'))


def splash(rows):
    rows = [r[:] for r in rows]
    for x, y in ((1, 1), (len(rows[0]) - 2, 1), (len(rows[0]) // 2, 0)):
        if rows[y][x] == '.': rows[y][x] = 'F'
    return rows


# The left eye (the first eye pixel) anchors every frame (see heroart.place), so the shell stays still:
# shell center (20, 15) lands on the canvas center (24, 16).
EYE_AT = (16 + 4, 7 + 1)
base = crab()
out = {
    'crab-checkpoint': project('Checkpoint Crab', 'crab', PAL, CODE, EYE_AT, [36, 12], 7, [
        ('idle', 3, [base, crab(claw=0.6), crab(eyes=False)]),
        ('move', 7, [crab(legs=1), crab(legs=-1)]),
        ('attack', 10, [crab(claw=1.8, lift=1), crab(claw=2.2, lift=1), splash(crab(claw=0)), base]),
        ('damage', 6, []),
        ('celebrate', 5, [crab(lift=1), base]),
        ('rest', 2, [crab(eyes=False, claw=0.4)]),
    ]),
}

if __name__ == '__main__':
    for pid, p in out.items():
        json.dump(p, open(os.path.join(HERE, pid + '.json'), 'w'))
    preview(out.values(), os.path.join(HERE, 'crab_preview.png'))
    print('ok')
