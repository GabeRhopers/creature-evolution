# Every hero's hatchling, drawn the same way (the concept in hatchling_egg_concept.jpg, Nov 25): the baby is still
# INSIDE its egg. The head pokes out of the front through a jagged hole, the tail pokes out of the back, two little
# claws stick out of holes underneath, and the shell has zigzag cracks.
#
# This script builds each hero's hatchling from its JUVENILE design (same poses and canvas), so it always matches the
# hero: it lays an egg over the middle of the body in every frame (fixed size and place, measured on the first swim
# frame, so the egg never jumps), keeps whatever sticks out, and writes <hero>-hatchling.json into
# public/studio/seeds (and next to this script). Run it after any script that redraws a juvenile:
#     python3 egg_hatchling.py              (all heroes)
#     python3 egg_hatchling.py fang         (one hero)
import os, sys, json, math

HERE = os.path.dirname(os.path.abspath(__file__))
SEEDS = os.path.join(HERE, '../../public/studio/seeds')
ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
STAMP = '2026-11-21T12:00:00.000Z'
VERSION = 5          # newer than every earlier hatchling, so untouched old starters are replaced
OUTLINE = '#181425'
# Shell colors: white, or beige for heroes with a white belly (so the egg stands out from the body).
SHELLS = {'white': ('#ffffff', '#c0cbdc'), 'beige': ('#ead4aa', '#c28569')}
HEROES = {   # hero prefix: (title, shell, share of the body length hidden in the egg)
    'croc': ('Crocodile 1: Hatchling', 'white', 0.42),
    'mosa': ('Mosa 1: Hatchling', 'white', 0.42),
    'white_shark': ('White Shark 1: Hatchling', 'beige', 0.40),
    'fang': ('Fang 1: Hatchling', 'beige', 0.40),
    'elder_croc': ('Elder Croc 1: Hatchling', 'beige', 0.40),
}


def decode(s, w, h):
    return [[-1 if s[y * w + x] == '.' else ALPH.index(s[y * w + x]) for x in range(w)] for y in range(h)]


def encode(g):
    return ''.join('.' if v < 0 else ALPH[v] for row in g for v in row)


def bbox(g):
    pts = [(x, y) for y, row in enumerate(g) for x, v in enumerate(row) if v >= 0]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), max(xs), min(ys), max(ys)


def egg_shape(src):
    """The egg's place and size, from the first swim frame: centered on the body, covering its middle."""
    w, h = src['w'], src['h']
    pose = next(p for p in src['poses'] if p['name'] == 'move' and p['frames'])
    g = decode(pose['frames'][0], w, h)
    x0, x1, y0, y1 = bbox(g)
    L = x1 - x0 + 1
    hide = HEROES[src['_hero']][2]
    rx = L * hide / 2
    cx = x0 + L * 0.47                       # a touch toward the tail: the head is the part that pokes out most
    # Tall enough to hide the body's middle (fins and legs may still peek out, like the concept's claws).
    col = [y for y in range(h) for x in range(int(cx - rx * 0.5), int(cx + rx * 0.5) + 1) if 0 <= x < w and g[y][x] >= 0]
    thick = (max(col) - min(col) + 1) if col else L * 0.2
    # An egg lying on its side: longer than tall (but tall enough to hide the body's middle).
    ry = min(max(rx * 0.66, thick * 0.55), rx * 0.78)
    cy = (min(col) + max(col)) / 2 if col else h / 2
    m = 3                                     # stay inside the framework margin
    ry = min(ry, cy - m, h - 1 - m - cy)
    rx = min(rx, cx - m, w - 1 - m - cx)
    return cx, cy, rx, ry


def body_color(g, pal, inside):
    """The creature's main color (for the claws): the most common non-outline color under the egg."""
    count = {}
    for (x, y) in inside:
        v = g[y][x]
        if v >= 0 and pal[v] not in (OUTLINE, '#000000'):
            count[v] = count.get(v, 0) + 1
    return max(count, key=count.get) if count else 0


def make_frame(g, pal, shape, idx, shell, shade, out_i, k):
    """One hatchling frame: the egg over the body, the head, tail and two claws poking out, cracks on the shell."""
    h, w = len(g), len(g[0])
    cx, cy, rx, ry = shape
    def egg_r(x, y):     # an egg: a little fuller at the back (left), narrower at the front
        sx = rx * (1.08 if x < cx else 0.94)
        return ((x - cx) / sx) ** 2 + ((y - cy) / ry) ** 2
    inside = [(x, y) for y in range(h) for x in range(w) if egg_r(x + 0.5, y + 0.5) <= 1]
    claw = body_color(g, pal, inside)
    out = [row[:] for row in g]
    ins = set(inside)
    for (x, y) in inside:                                   # the shell, shaded on its lower back
        lower_back = (y - cy) / ry + (cx - x) / (rx * 2.2) > 0.55
        out[y][x] = shade if lower_back else shell
    for (x, y) in inside:                                   # its outline
        if any((x + dx, y + dy) not in ins for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
            out[y][x] = out_i
    # Jagged holes where the head and the tail come out: broken shell teeth stick out over the neck and the tail root.
    for side in (1, -1):
        for y in range(h):
            row = [x for x in range(w) if (x, y) in ins]
            if not row: continue
            edge = max(row) if side > 0 else min(row)
            if abs(y - cy) > ry * 0.7: continue
            if not (0 <= edge + side < w and g[y][edge + side] >= 0): continue   # only where the body comes out
            tooth = 2 if (y // 2) % 2 == 0 else 0
            for t in range(1, tooth + 1):
                x = edge + side * t
                if 3 <= x < w - 3: out[y][x] = shell
            x = edge + side * (tooth + 1)
            if 3 <= x < w - 3 and tooth: out[y][x] = out_i
    # Zigzag cracks (fixed spots on the shell).
    for (fx, fy, ln) in ((0.25, -0.45, 4), (-0.35, 0.15, 3), (0.05, 0.35, 3)):
        x, y = cx + fx * rx, cy + fy * ry
        for s in range(ln):
            px, py = int(round(x + s)), int(round(y + (s % 2) - 0.5))
            if (px, py) in ins: out[py][px] = out_i
    # Two little claws poking out of holes underneath (they paddle: the toes move every other frame).
    for i, fx in enumerate((0.45, -0.35)):
        bx = int(round(cx + fx * rx))
        by = int(round(cy + ry * math.sqrt(max(0.0, 1 - fx * fx)))) - 1
        reach = 1 + ((k + i) % 2)
        pts = [(bx, by), (bx - 1, by), (bx, by + 1), (bx - 1, by + 1)] + [(bx + t, by + 1 + reach) for t in (-2, 0, 1)] + [(bx - 1, by + reach), (bx, by + reach)]
        for (px, py) in pts:
            if 3 <= px < w - 3 and 3 <= py < h - 3: out[py][px] = claw
        for (px, py) in pts:                               # outline around the claw
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                qx, qy = px + dx, py + dy
                if 3 <= qx < w - 3 and 3 <= qy < h - 3 and out[qy][qx] < 0: out[qy][qx] = out_i
    return out


def build(hero):
    src = json.load(open(os.path.join(SEEDS, f'{hero}-juvenile.json')))
    src['_hero'] = hero
    title, shell_kind, _ = HEROES[hero]
    pal = list(src['palette'])
    def color(c):
        if c not in pal: pal.append(c)
        return pal.index(c)
    shell, shade = (color(c) for c in SHELLS[shell_kind])
    out_i = color(OUTLINE)
    shape = egg_shape(src)
    w, h = src['w'], src['h']
    poses = []
    for p in src['poses']:
        frames = []
        for k, f in enumerate(p['frames']):
            if not f.strip('.'):
                frames.append(f)
                continue
            frames.append(encode(make_frame(decode(f, w, h), pal, shape, None, shell, shade, out_i, k)))
        poses.append({'name': p['name'], 'fps': p.get('fps'), 'frames': frames})
    # The cheer and the hurt flash need frames too: a hatchling wiggles its swim frames.
    move = next(p for p in poses if p['name'] == 'move')
    for p in poses:
        if not p['frames'] or not any(f.strip('.') for f in p['frames']):
            if p['name'] in ('celebrate',): p['frames'] = move['frames'][:2]
    cx, cy, rx, ry = shape
    proj = {
        'name': title, 'w': w, 'h': h, 'palette': pal, 'framework': src['framework'],
        # The egg is the body: the hit circle is about the egg's size; the head and tail poke out past it.
        'bodyRadius': max(3, int(round(ry))), 'mouth': src['mouth'], 'pixelScale': src.get('pixelScale', 3),
        'poses': poses, 'updatedAt': STAMP, 'seedVersion': VERSION,
    }
    for d in (SEEDS, HERE):
        json.dump(proj, open(os.path.join(d, f'{hero}-hatchling.json'), 'w'))
    return proj


def preview(projects):
    from PIL import Image
    rows = []
    for proj in projects:
        w, h, pal = proj['w'], proj['h'], proj['palette']
        imgs = []
        for p in proj['poses']:
            for f in p['frames']:
                if not f.strip('.'): continue
                im = Image.new('RGB', (w, h), (30, 70, 120))
                px = im.load()
                for i, ch in enumerate(f):
                    if ch != '.':
                        c = pal[ALPH.index(ch)]
                        px[i % w, i // w] = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5))
                imgs.append(im.resize((w * 4, h * 4), Image.NEAREST))
        rows.append(imgs[:6])
    W = max(sum(i.width + 6 for i in r) for r in rows)
    H = sum(max(i.height for i in r) + 6 for r in rows)
    sheet = Image.new('RGB', (W, H), (12, 20, 32))
    y = 0
    for r in rows:
        x = 0
        for i in r:
            sheet.paste(i, (x, y)); x += i.width + 6
        y += max(i.height for i in r) + 6
    sheet.save(os.path.join(HERE, 'egg_hatchlings.png'))


if __name__ == '__main__':
    heroes = sys.argv[1:] or list(HEROES)
    projects = [build(hro) for hro in heroes]
    preview(projects)
    print('ok', heroes)
