# White Shark: the third playable hero, drawn in the same style as Mike's Croc and Mosa:
# a thick dark outline, a two-tone body (grey back, white belly), one tooth row, a yellow eye,
# blocky shapes. Hatchling, juvenile and adult are the same shark at three sizes; the hatchling
# sits in a broken eggshell with a piece of shell on its head, like the other heroes.
# Run from this folder:  python3 draw_shark.py   -> white_shark-*.json + shark_preview.png
import os, json
from heroart import (OUTLINE, EYE, MOUTH, SPLASH, SHELL_CRACK, HERE,
                     outline_around, trim, blink, open_jaw, egg, project, preview)

# Every color is from Endesga 32 (no signature colors needed).
PAL = [OUTLINE,      # 0 K outline
       '#8b9bb4',    # 1 g grey back
       '#ffffff',    # 2 W white belly, teeth, eggshell
       '#5a6988',    # 3 G fins (darker grey)
       EYE,          # 4 Y eye
       MOUTH,        # 5 E inside of the mouth
       SPLASH,       # 6 F water splash, s eggshell shade
       SHELL_CRACK,  # 7 c eggshell crack
       '#c0cbdc',    # 8 w light grey stripe between back and belly
       '#ead4aa',    # 9 S eggshell: beige and leathery, like a real shark egg, so it stands out from the white belly
       '#c28569']    # A s eggshell shade
CODE = {'B': '0', 'K': '0', 'g': '1', 'W': '2', 'T': '2', 'S': '9', 'G': '3', 'Y': '4', 'E': '5',
        'F': '6', 's': 'A', 'c': '7', 'w': '8', '.': '.'}

# The adult's shape, facing right: x from the tail tip (0) to the snout tip (48), y from the body's center line.
BODY = [(9, -1), (14, -3), (20, -5), (28, -6.2), (36, -5.4), (42, -3.4), (46, -1.4), (48.6, 0.2),
        (46, 2), (40, 3.6), (30, 5), (20, 4.4), (14, 2.8), (9, 1.2)]
PEDUNCLE = [(5, -1.6), (11, -1.6), (11, 1.6), (5, 1.6)]
DORSAL = [(20, -4.6), (22.5, -11.2), (24.5, -11.2), (30, -5.8)]
PECTORAL = [(30, 4.6), (25, 9.4), (27.2, 9.4), (34.5, 4)]
TAIL_UP = [(10.5, -0.8), (3, -11.5), (0.5, -11.5), (5, -0.8)]
TAIL_DOWN = [(10.5, 0.8), (3, 8.4), (0.8, 8.4), (5, 0.8)]


def inside(poly, x, y):
    """Point in polygon (even-odd rule)."""
    n, hit = len(poly), False
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def shark(scale, tail=0.0, belly_rise=0.0):
    """The shark at `scale` (1 = adult, 48 px long). tail: the tail fin swings up (-) or down (+) in pixels."""
    W, H, cy = round(52 * scale) + 4, round(26 * scale) + 6, round(13 * scale) + 3
    S = lambda poly, dy=0.0: [(x * scale + 2, y * scale + dy) for x, y in poly]
    rows = [['.'] * W for _ in range(H)]
    shapes = [(S(TAIL_UP, tail), 'G'), (S(TAIL_DOWN, tail), 'G'), (S(PEDUNCLE, tail * 0.5), 'g'),
              (S(DORSAL), 'G'), (S(PECTORAL), 'G'), (S(BODY), 'body')]
    for y in range(H):
        for x in range(W):
            px, py = x + 0.5, y + 0.5 - cy
            for poly, col in shapes:
                if inside(poly, px, py):
                    if col == 'body':
                        # grey back, a light stripe, white belly (the belly line rises toward the snout)
                        line = (0.9 - belly_rise) * scale - (px - 2) / (48 * scale) * 1.6 * scale
                        col = 'g' if py < line - 1 else 'w' if py < line else 'W'
                    rows[y][x] = col
                    break
    # face: eye (yellow, pupil, yellow like Mosa), tooth row along the mouth, two gill slits
    ey = round(cy - 2.3 * scale)
    ex = round(38.6 * scale + 2)
    rows[ey][ex - 1], rows[ey][ex], rows[ey][ex + 1] = 'Y', 'K', 'Y'
    # the mouth line: the lowest row (just under the snout's middle) that still reaches 3 pixels past the eye
    reach = lambda y: max([x for x in range(W) if rows[y][x] != '.'] or [0])
    ty = max(y for y in range(cy, cy + max(1, round(1.5 * scale)) + 1) if reach(y) >= ex + 3)
    tip = reach(ty)
    for x in range(ex + 1, tip + 1):
        rows[ty][x] = 'K' if (tip - x) % 2 == 0 else 'T'
    for gx in ((round(32 * scale + 2), round(34.5 * scale + 2)) if scale > 0.6 else ()):
        for dy in range(-1, 2 if scale > 0.6 else 1):
            if rows[cy + dy][gx] != '.': rows[cy + dy][gx] = 'K'
    rows = outline_around(rows, 'gGwWYT')
    return trim(rows)


ADULT, JUV, HATCH = 1.0, 0.7, 0.5


# The egg sits in the same place in every frame (measured on the plain hatchling).
_H = shark(HATCH)
EGG = dict(cx=round(len(_H[0]) * 0.52), cy=round(len(_H) * 0.75), rx=7, ry=4, cap_w=5)


def in_egg(rows):
    """The hatchling in its eggshell, with a piece of shell on its head."""
    return egg(rows, **EGG)


def frames(scale, eggy=False):
    f = (lambda r: in_egg(r)) if eggy else (lambda r: r)
    base = shark(scale)
    up, down = shark(scale, tail=-1.6 * scale - 0.4), shark(scale, tail=1.6 * scale + 0.4)
    return {
        'idle': [f(base), f(up), blink(f(base))],
        'move': [f(up), f(base), f(down), f(base)],
        'attack': [f(open_jaw(base, 1 if scale < 0.6 else 2)), f(open_jaw(base, 2 if scale < 0.6 else 3)),
                   f(open_jaw(base, 0, splash=True)), f(base)],
        'celebrate': [f(up), f(down)],
        'rest': [blink(f(base))],
    }


def poses(fr):
    return [('idle', 3, fr['idle']), ('move', 6, fr['move']), ('attack', 10, fr['attack']),
            ('damage', 6, []), ('celebrate', 6, fr['celebrate']), ('rest', 2, fr['rest'])]


out = {
    'white_shark-hatchling': project('White Shark 1: Hatchling', 'white_shark', PAL, CODE, (40, 22), [46, 23], 5, poses(frames(HATCH, True))),
    'white_shark-juvenile': project('White Shark 2: Juvenile', 'white_shark', PAL, CODE, (42, 21), [50, 23], 6, poses(frames(JUV))),
    'white_shark-adult': project('White Shark 3: Adult', 'white_shark', PAL, CODE, (45, 20), [56, 22], 8, poses(frames(ADULT))),
}

if __name__ == '__main__':
    for pid, p in out.items():
        json.dump(p, open(os.path.join(HERE, pid + '.json'), 'w'))
    preview(out.values(), os.path.join(HERE, 'shark_preview.png'))
    print('ok')
