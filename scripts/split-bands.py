# 按真实行/列空隙切分 6x9 图鉴(行高不等、精灵跨行的 AI 深底大图)
# 与 split-watershed.py 的等分网格不同:先用投影谷值 DP 找 5 条行分界、
# 再在每个行带内找 8 条列分界,分界线落在精灵之间的空隙上,不会切掉头顶。
# 用法: python3 scripts/split-bands.py <输入图> <输出目录> <属性...54个>
import sys
import os
import importlib.util
import numpy as np
from PIL import Image
from scipy import ndimage

_spec = importlib.util.spec_from_file_location(
    'ss', os.path.join(os.path.dirname(__file__), 'split-sheet.py'))
ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ss)


def pick_bounds(proj, n, sigma=5.0, min_gap=0.5, max_gap=1.8, anchor=False):
    """在投影上选 n-1 条分界线。
    anchor=False: DP 选全局低密度谷(用于行分界,行高可能不均)。
    anchor=True : 每格在等分位置附近微调(用于列分界,列宽基本均匀,
                  可避免某行有空格时把分界挤歪)。
    """
    L = len(proj)
    sm = ndimage.gaussian_filter1d(proj.astype(float), sigma)
    unit = L / n
    if anchor:
        win = int(unit * 0.26)
        lines = []
        for k in range(1, n):
            c = int(k * unit)
            lo, hi = max(1, c - win), min(L - 1, c + win)
            lines.append(lo + int(np.argmin(sm[lo:hi])))
        return [0] + lines + [L]
    lo_gap, hi_gap = unit * min_gap, unit * max_gap
    edge = max(12, int(unit * 0.45))          # 排除贴画面边缘的空带
    cands = [i for i in range(edge, L - edge)
             if sm[i] <= sm[i - 1] and sm[i] <= sm[i + 1]]
    if not cands:
        cands = list(range(edge, L - edge))
    # 每个候选 (位置, 代价)
    INF = float('inf')
    # dp[k][j] = 选到第 k 条线、且第 k 条是 cands[j] 时的最小代价
    dp = [[INF] * len(cands) for _ in range(n)]
    prev = [[-1] * len(cands) for _ in range(n)]
    for j, p in enumerate(cands):
        dp[1][j] = sm[p]
    for k in range(2, n):
        for j, p in enumerate(cands):
            l, r = p - hi_gap, p - lo_gap
            # 二分找 cands 中 >= l 和 <= r 的区间
            import bisect
            a = bisect.bisect_left(cands, l)
            b = bisect.bisect_right(cands, r) - 1
            if a > b:
                continue
            # 区间内 dp[k-1] 最小值 —— 用稀疏表简化:线性扫描(候选数很少)
            seg = dp[k - 1][a:b + 1]
            v = min(seg)
            if v < INF:
                dp[k][j] = v + sm[p]
                prev[k][j] = a + seg.index(v)
    end = min(range(len(cands)), key=lambda j: dp[n - 1][j])
    if dp[n - 1][end] >= INF:
        # 退化:等分
        return [int(i * unit) for i in range(n + 1)]
    lines = []
    k, j = n - 1, end
    while k >= 1:
        lines.append(cands[j])
        j = prev[k][j]
        k -= 1
    lines.reverse()
    return [0] + lines + [L]


def remove_bg_deep(im):
    """深底大图抠底:整图 floodfill 后,残留的底色常被光晕/星点切成
    互不连通的小块,只从四边灌水清不掉。这里补一层:所有「接近底色且
    与已透明区域连通」的暗色像素一并透明化;精灵内部被亮色包住的
    暗色(眼睛、深色衣服)不连通,会保留。"""
    rgba = ss.remove_bg_full(im)
    rgb0 = np.asarray(im.convert('RGB'))[3, 3].astype(int)
    if min(rgb0) > 150:
        return rgba                      # 浅底图沿用原逻辑
    arr = np.array(rgba)
    rgb = arr[:, :, :3].astype(int)
    alpha = arr[:, :, 3]
    d2 = ((rgb - rgb0) ** 2).sum(axis=2)
    near = ((d2 < 58 ** 2)
            & (rgb.max(axis=2) < 100)
            & ((rgb.max(axis=2) - rgb.min(axis=2)) < 58)
            & (alpha > 0))
    cand = near | (alpha == 0)
    lbl, _ = ndimage.label(cand, structure=ndimage.generate_binary_structure(2, 1))
    seeds = np.unique(lbl[alpha == 0])
    arr[np.isin(lbl, seeds), 3] = 0
    return Image.fromarray(arr)


def main():
    src, outdir, *names = sys.argv[1:]
    n = len(names)
    if n != 54:
        print('!! 需要 54 个属性名(6 行 x 9 列)')
        sys.exit(1)
    rgba = remove_bg_deep(Image.open(src))
    w, h = rgba.size
    alpha = np.asarray(rgba.getchannel('A')) > 0

    yb = pick_bounds(alpha.sum(axis=1), 6, sigma=5, min_gap=0.5, max_gap=1.8)
    print(f'行分界: {yb}')
    os.makedirs(outdir, exist_ok=True)
    for r in range(6):
        y0, y1 = yb[r], yb[r + 1]
        band = alpha[y0:y1]
        xb = pick_bounds(band.sum(axis=0), 9, sigma=5, anchor=True)
        print(f'  行{r+1} y={y0}..{y1} 列分界: {xb}')
        for c in range(9):
            x0, x1 = xb[c], xb[c + 1]
            name = names[r * 9 + c]
            tile = rgba.crop((x0, y0, x1, y1)).copy()
            out = ss.normalize(ss.clean_tile(tile))
            if out is None:
                print(f'!! {name}: 空区域,跳过')
                continue
            out.save(os.path.join(outdir, f'{name}.png'))


if __name__ == '__main__':
    main()
