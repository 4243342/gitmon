# 标记分水岭切分:布局规则(6 行 × 9 列)但精灵大且互相粘连的图鉴
# 每格窗口内取距离场最大点作种子,按距离场降序淹没划分领地
# 用法: python3 scripts/split-watershed.py <输入图> <输出种族目录> <属性...54个>
import sys
import os
import heapq
import importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

_spec = importlib.util.spec_from_file_location('ss', os.path.join(os.path.dirname(__file__), 'split-sheet.py'))
ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ss)


def flood(dist, mask, markers):
    hh, hw = mask.shape
    owner = np.zeros((hh, hw), dtype=np.int32)
    heap = []
    for y, x in zip(*np.nonzero(markers)):
        k = int(markers[y, x])
        owner[y, x] = k
        heapq.heappush(heap, (-dist[y, x], y, x, k))
    while heap:
        d, y, x, k = heapq.heappop(heap)
        for ny, nx in ((y+1, x), (y-1, x), (y, x+1), (y, x-1)):
            if 0 <= ny < hh and 0 <= nx < hw and mask[ny, nx] and owner[ny, nx] == 0:
                owner[ny, nx] = k
                heapq.heappush(heap, (-dist[ny, nx], ny, nx, k))
    return owner


def main():
    src, outdir, *names = sys.argv[1:]
    n = len(names)
    if n != 54:
        print('!! 此脚本按 6x9 网格处理,需要 54 个属性名')
        sys.exit(1)
    im = Image.open(src)
    rgba = ss.remove_bg_full(im)
    w, h = rgba.size
    hw, hh = w // 2, h // 2
    mask = (np.asarray(rgba.getchannel('A').resize((hw, hh), Image.NEAREST)) > 0)
    dist = ndimage.distance_transform_edt(mask)
    # 54 个格窗口,各取窗口内 dist 最大点作种子
    markers = np.zeros((hh, hw), dtype=np.int32)
    for r in range(6):
        for c in range(9):
            y0 = int(r * hh / 6 + hh / 30)         # 中央 ~67% 区域,防种子落到邻行伸进来的部件
            y1 = int((r + 1) * hh / 6 - hh / 30)
            x0 = int(c * hw / 9 + hw / 30)
            x1 = int((c + 1) * hw / 9 - hw / 30)
            win = dist[y0:y1, x0:x1]
            if win.max() <= 0:
                print(f'!! 行{r} 列{c} 窗口内没有精灵')
                sys.exit(1)
            dy, dx = np.unravel_index(int(win.argmax()), win.shape)
            markers[y0 + dy, x0 + dx] = r * 9 + c + 1
    owner = flood(dist, mask, markers)
    grid = {k: [] for k in range(1, n + 1)}
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys.tolist(), xs.tolist()):
        k = int(owner[y, x])
        if k:
            grid[k].append((x, y))
    os.makedirs(outdir, exist_ok=True)
    for idx, name in enumerate(names):
        pix = grid[idx + 1]
        if not pix:
            print(f'!! {name}: 格位空缺,跳过')
            continue
        xs_ = [p[0] for p in pix]
        ys_ = [p[1] for p in pix]
        bx = (min(xs_) * 2, min(ys_) * 2, max(xs_) * 2, max(ys_) * 2)
        pad = 8
        tile = rgba.crop((max(0, bx[0] - pad), max(0, bx[1] - pad),
                          min(w, bx[2] + pad), min(h, bx[3] + pad)))
        out = ss.normalize(ss.clean_tile(tile))
        if out is None:
            print(f'!! {name}: 空区域,跳过')
            continue
        out.save(os.path.join(outdir, f'{name}.png'))
        bb = out.getbbox()
        print(f'-> {name}.png  内容 {bb[2]-bb[0]}x{bb[3]-bb[1]}')


if __name__ == '__main__':
    main()
