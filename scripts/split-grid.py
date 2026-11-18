# 投影切割:对精灵大且互相粘连的图鉴,按密度谷值切行/列,每格独立抠底
# 用法: python3 scripts/split-grid.py <输入图> <输出种族目录> <属性...54个>
import sys
import os
import importlib.util
from PIL import Image

_spec = importlib.util.spec_from_file_location('ss', os.path.join(os.path.dirname(__file__), 'split-sheet.py'))
ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ss)


def profile(img, axis):
    # alpha 密度投影:axis=0 按列(x), axis=1 按行(y)
    a = img.getchannel('A')
    w, h = a.size
    px = a.load()
    if axis == 0:
        return [sum(1 for y in range(h) if px[x, y] > 40) for x in range(w)]
    return [sum(1 for x in range(w) if px[x, y] > 40) for y in range(h)]


def find_splits(prof, nseg, search):
    L = len(prof)
    cuts = []
    for i in range(1, nseg):
        ideal = i * L // nseg
        lo, hi = max(0, ideal - search), min(L, ideal + search)
        b = min(range(lo, hi), key=lambda x: prof[x])
        cuts.append(b)
    return [0] + cuts + [L]


def cell_bg(im):
    # 单格抠底:复用 remove_bg_full(按格边缘种子 floodfill)
    return ss.remove_bg_full(im)


def main():
    src, outdir, *names = sys.argv[1:]
    n = len(names)
    rows = 6 if n == 54 else (n + 8) // 9
    cols = 9 if n >= 9 else n
    im = Image.open(src).convert('RGB')
    w, h = im.size
    # 先整图粗抠底(仅用于投影密度,不用于输出)
    rough = ss.remove_bg_full(im.copy())
    ys = profile(rough, 1)
    xs = profile(rough, 0)
    ybounds = find_splits(ys, rows, h // rows // 4)
    rb = find_splits(xs, cols, w // cols // 4)
    print('行切线', ybounds, '列切线', rb)
    os.makedirs(outdir, exist_ok=True)
    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            if idx >= n:
                break
            box = (rb[c], ybounds[r], rb[c + 1], ybounds[r + 1])
            tile = im.crop(box)
            rgba = cell_bg(tile)
            out = ss.normalize(ss.clean_tile(rgba))
            if out is None:
                print(f'!! {names[idx]}: 空区域,跳过')
                continue
            out.save(os.path.join(outdir, f'{names[idx]}.png'))
            bb = out.getbbox()
            print(f'-> {names[idx]}.png  内容 {bb[2]-bb[0]}x{bb[3]-bb[1]}')


if __name__ == '__main__':
    main()
