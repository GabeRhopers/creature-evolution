# Elder Shark (was Fang) swim update: decodes elder_shark_swim_sheet.jpg and runs build_swim.mjs (see there), then the
# hatchling is redrawn from the new juvenile (egg_hatchling.py fang) and a preview is written (swim_preview.png).
#     python3 update_swim.py      (run once: it refuses to pad a canvas that is already 100x60)
import os, subprocess, tempfile, json
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'


def main():
    im = Image.open(os.path.join(HERE, 'elder_shark_swim_sheet.jpg')).convert('RGBA')
    with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as f:
        f.write(im.tobytes())
    subprocess.run(['node', os.path.join(HERE, 'build_swim.mjs'), f.name, str(im.width), str(im.height)], check=True)
    os.unlink(f.name)
    subprocess.run(['python3', os.path.join(HERE, '../heroes/egg_hatchling.py'), 'fang'], check=True)
    tiles = []
    for stage in ('juvenile', 'hatchling'):
        p = json.load(open(os.path.join(HERE, f'../../public/studio/seeds/fang-{stage}.json')))
        w, h = p['w'], p['h']
        for pose in p['poses']:
            for fr in pose['frames'][:3]:
                t = Image.new('RGB', (w, h), (30, 70, 120))
                px = t.load()
                for i, ch in enumerate(fr):
                    if ch != '.':
                        c = p['palette'][ALPH.index(ch)]
                        px[i % w, i // w] = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5))
                tiles.append(t.resize((w * 3, h * 3), Image.NEAREST))
    cols = 5
    W, H = tiles[0].width, tiles[0].height
    sheet = Image.new('RGB', (cols * (W + 4), ((len(tiles) + cols - 1) // cols) * (H + 4)))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * (W + 4), (i // cols) * (H + 4)))
    sheet.save(os.path.join(HERE, 'swim_preview.png'))


if __name__ == '__main__':
    main()
