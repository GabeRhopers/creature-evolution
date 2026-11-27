# The Fisher Ape (Rhopers' sheet fisher_ape_sheet.jpg, Nov 27): a monkey with a fishing rod. Keeps the poses the game uses
# (idle x3, walk x3, cast, hook, catch, celebration x2), drops the labels, ponds and grass, and erases the drawn line and
# hooked fish from the HOOK pose (the game draws its own line and hook, so they reach any depth). Then runs
# build_fisher.mjs, which uses the Sprite Studio skin engine to sample, color-map and place the poses, and writes
# public/studio/seeds/beast-fisher_ape.json. Also draws fisher_preview.png.
#     python3 tools/fisher/convert_fisher.py
import os, subprocess, tempfile, json
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
# Boxes on the sheet (x0, y0, x1, y1), found with the skin engine's sprite finder.
POSES = [
    ('idle', (28, 94, 251, 316)), ('idle', (253, 94, 474, 316)), ('idle', (479, 94, 704, 316)),
    ('walk', (41, 449, 218, 655)), ('walk', (269, 449, 450, 654)), ('walk', (498, 449, 677, 654)),
    ('cast', (23, 760, 240, 971)), ('hook', (244, 759, 480, 971)), ('catch', (487, 760, 712, 971)),
    ('celebrate', (97, 1174, 287, 1399)), ('celebrate', (423, 1139, 644, 1399)),
]
# Parts of a box to wipe (sheet coordinates): the HOOK pose's line, fish and splash; grass at its feet.
WIPE = {7: [(437, 790, 480, 971), (244, 950, 322, 971)]}


def main():
    im = Image.open(os.path.join(HERE, 'fisher_ape_sheet.jpg')).convert('RGB')
    bg = im.getpixel((5, 5))
    # A clean sheet: only the chosen poses, one row each in the same order, nothing else.
    cell_w, cell_h = 260, 320
    out = Image.new('RGB', (cell_w * len(POSES) + 40, cell_h + 40), bg)
    for i, (name, (x0, y0, x1, y1)) in enumerate(POSES):
        crop = im.crop((x0, y0, x1, y1))
        d = ImageDraw.Draw(crop)
        for (a, b, c, e) in WIPE.get(i, []):
            d.rectangle((a - x0, b - y0, c - x0, e - y0), fill=bg)
        # Feet on one line (bottom of the cell), same left offset as on the sheet within its column.
        out.paste(crop, (20 + i * cell_w + (cell_w - crop.width) // 2, 20 + cell_h - crop.height))
    out.save('/tmp/fisher_clean.png')
    rgba = out.convert('RGBA')
    # Background-blue pockets closed in by an arm and the tail would stay in the drawing: every pixel close to the
    # background color is made see-through (the ape has no navy in it).
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = px[x, y]
            if abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) < 40:
                px[x, y] = (r, g, b, 0)
    with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as f:
        f.write(rgba.tobytes())
    subprocess.run(['node', os.path.join(HERE, 'build_fisher.mjs'), f.name, str(rgba.width), str(rgba.height),
                    json.dumps([p[0] for p in POSES])], check=True)
    os.unlink(f.name)
    p = json.load(open(os.path.join(HERE, 'beast-fisher_ape.json')))
    w, h = p['w'], p['h']
    tiles = []
    for pose in p['poses']:
        for fr in pose['frames']:
            t = Image.new('RGB', (w, h), (30, 70, 120))
            px = t.load()
            for i, ch in enumerate(fr):
                if ch != '.':
                    c = p['palette'][ALPH.index(ch)]
                    px[i % w, i // w] = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5))
            tiles.append(t.resize((w * 4, h * 4), Image.NEAREST))
    sheet = Image.new('RGB', (len(tiles) * (w * 4 + 4), h * 4), (0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * (w * 4 + 4), 0))
    sheet.save(os.path.join(HERE, 'fisher_preview.png'))


if __name__ == '__main__':
    main()
