# Spino, the sixth hero: one sheet per stage from Rhopers and Mike (spino_<stage>_sheet.jpg, Nov 26; the hatchling is drawn
# inside its egg). Decodes the pictures and runs build_spino.mjs, which uses the Sprite Studio skin engine to find the four
# poses, turn them to face right and write spino-*.json into public/studio/seeds and next to this script. Then draws
# spino_preview.png (every pose of every stage).
#     python3 convert_spino.py
import os, subprocess, tempfile, json
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ALPH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'


def main():
    args, tmp = [], []
    for stage in ('hatchling', 'juvenile', 'adult'):
        im = Image.open(os.path.join(HERE, f'spino_{stage}_sheet.jpg')).convert('RGBA')
        with tempfile.NamedTemporaryFile(suffix='.raw', delete=False) as f:
            f.write(im.tobytes())
        tmp.append(f.name)
        args += [stage, f.name, str(im.width), str(im.height)]
    subprocess.run(['node', os.path.join(HERE, 'build_spino.mjs'), *args], check=True)
    for t in tmp:
        os.unlink(t)
    tiles = []
    for stage in ('hatchling', 'juvenile', 'adult'):
        p = json.load(open(os.path.join(HERE, f'spino-{stage}.json')))
        w, h = p['w'], p['h']
        for pose in p['poses']:
            if pose['name'] not in ('move', 'attack', 'damage'):
                continue
            for fr in pose['frames'][:4]:
                t = Image.new('RGB', (w, h), (30, 70, 120))
                px = t.load()
                for i, ch in enumerate(fr):
                    if ch != '.':
                        c = p['palette'][ALPH.index(ch)]
                        px[i % w, i // w] = tuple(int(c[j:j + 2], 16) for j in (1, 3, 5))
                tiles.append(t.resize((w * 3, h * 3), Image.NEAREST))
    cols = 5
    W, H = tiles[0].width, tiles[0].height
    sheet = Image.new('RGB', (cols * (W + 4), ((len(tiles) + cols - 1) // cols) * (H + 4)), (0, 0, 0))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * (W + 4), (i // cols) * (H + 4)))
    sheet.save(os.path.join(HERE, 'spino_preview.png'))


if __name__ == '__main__':
    main()
