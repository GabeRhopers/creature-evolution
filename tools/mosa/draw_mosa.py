# Mosa: the second playable hero, from Mike's drawings.
#
#   reference-base.jpg   one Mosa, 32 x 10 pixels (faces left)  -> juvenile, and the hatchling made from it
#   reference-poses.jpg  five swim poses, about 48 x 20 pixels  -> adult
#
# The drawings were sampled cell by cell into base_grid.txt and strip_grid.txt
# (K outline, d dark teal, l light teal, Y eye, T teeth). This script turns them into
# three Sprite Studio starter designs on the "mosa" framework (64 x 48 canvas).
# The hatchling sits in a broken eggshell with a piece of shell on its head, like the crocodile's.
# Run from this folder:  python3 draw_mosa.py   -> mosa-*.json + mosa_preview.png
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'heroes'))
from heroart import (OUTLINE, EYE, MOUTH, SPLASH, SHELL, SHELL_CRACK,  # noqa: E402
                     trim, blink, open_jaw, egg, project, preview)

# Palette: Endesga 32 outline, eye, mouth and eggshell, plus Mosa's 3 signature colors from the drawing.
PAL = [OUTLINE,      # 0 K outline
       '#429698',    # 1 d dark teal   (signature)
       '#58c2c2',    # 2 l light teal  (signature)
       EYE,          # 3 Y eye
       '#fefeb4',    # 4 T teeth       (signature)
       MOUTH,        # 5 E inside of the mouth
       SPLASH,       # 6 F water splash, s eggshell shade
       SHELL,        # 7 S eggshell
       SHELL_CRACK]  # 8 c eggshell crack
CODE = {'B': '0', 'K': '0', 'd': '1', 'l': '2', 'Y': '3', 'T': '4', 'E': '5', 'F': '6', 's': '6', 'S': '7', 'c': '8', '.': '.'}


def clean_teeth(rows):
    """The teeth row alternates tooth / gap from the snout tip, like the drawing (JPEG noise removed)."""
    for r in rows:
        if 'T' not in r: continue
        first = r.index('T') - 1
        last = max(x for x, c in enumerate(r) if c != '.')
        for x in range(first, last + 1):
            r[x] = 'K' if (last - x) % 2 == 0 else 'T'
        r[last] = 'K'
        break
    return rows


def legs(rows, step):
    """Walk/paddle: front and back legs (the rows under the body) shift opposite ways by one pixel."""
    rows = [r[:] for r in rows]
    t = next(y for y, r in enumerate(rows) if 'T' in r)
    mid = len(rows[0]) // 2
    for y in range(t + 2, len(rows)):
        back, front = rows[y][:mid], rows[y][mid:]
        back = (back[1:] + ['.']) if step > 0 else (['.'] + back[:-1])
        front = (['.'] + front[:-1]) if step > 0 else (front[1:] + ['.'])
        rows[y] = back + front
    return rows


def tail_flick(rows):
    """Tail tip one pixel higher (the leftmost columns rise)."""
    rows = [r[:] for r in rows]
    for x in range(0, 3):
        col = [rows[y][x] for y in range(len(rows))][1:] + ['.']
        for y in range(len(rows)): rows[y][x] = col[y]
    return rows


def shrink(rows, drop_cols):
    """Hatchling: the juvenile with some repeated snout, body and tail columns removed."""
    return [[c for x, c in enumerate(r) if x not in drop_cols] for r in rows]


STRIP = open(os.path.join(HERE, 'strip_grid.txt')).read().split('\n')
POSES = [clean_teeth(trim([r[a:b] for r in STRIP]))
         for a, b in ((2, 50), (52, 97), (99, 144), (146, 187), (187, 238))]
BASE = [list(r[::-1]) for r in trim(open(os.path.join(HERE, 'base_grid.txt')).read().split('\n'))]  # face right

P1, P2, P3, P4, P5 = POSES
JUV = BASE
# hatchling: drop 2 snout, 2 body (between the legs) and 2 tail columns (all plain repeats in the drawing)
HATCH = shrink(JUV, {1, 3, 12, 13, 25, 27})


def in_egg(rows):
    """The hatchling in its eggshell: the shell covers the legs and belly; tail and head stick out."""
    return egg(rows, cx=12, cy=8, rx=7, ry=4, cap_w=5)


H0 = in_egg(HATCH)
out = {
    'mosa-hatchling': project('Mosa 1: Hatchling', 'mosa', PAL, CODE, (40, 22), [47, 23], 4, [
        ('idle', 3, [H0, in_egg(tail_flick(HATCH)), blink(H0)]),
        ('move', 6, [H0, in_egg(tail_flick(HATCH))]),
        ('attack', 10, [in_egg(open_jaw(HATCH, 1)), in_egg(open_jaw(HATCH, 2)), H0]),
        ('damage', 6, []), ('celebrate', 6, [in_egg(tail_flick(HATCH)), H0]), ('rest', 2, [blink(H0)])],
        version=4),   # 4: hatches from an egg
    'mosa-juvenile': project('Mosa 2: Juvenile', 'mosa', PAL, CODE, (42, 22), [51, 23], 5, [
        ('idle', 3, [JUV, tail_flick(JUV), blink(JUV)]),
        ('move', 6, [legs(JUV, 1), legs(JUV, -1)]),
        ('attack', 10, [open_jaw(JUV, 1), open_jaw(JUV, 2), open_jaw(JUV, 0, splash=True), JUV]),
        ('damage', 6, []), ('celebrate', 6, [tail_flick(JUV), JUV]), ('rest', 2, [blink(JUV)])]),
    'mosa-adult': project('Mosa 3: Adult', 'mosa', PAL, CODE, (44, 20), [57, 22], 8, [
        ('idle', 3, [P1, P1, blink(P1)]),
        ('move', 5, [P5, P3, P5, P4]),
        ('attack', 10, [open_jaw(P5, 2), open_jaw(P5, 3), open_jaw(P5, 0, splash=True), P5]),
        ('damage', 6, []), ('celebrate', 5, [P2, P3]), ('rest', 2, [blink(P5)])]),
}

if __name__ == '__main__':
    for pid, p in out.items():
        json.dump(p, open(os.path.join(HERE, pid + '.json'), 'w'))
    preview(out.values(), os.path.join(HERE, 'mosa_preview.png'))
    print('ok')
