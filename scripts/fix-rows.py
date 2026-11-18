# 底部行专项修复:行带内像素按列均分归属(不听种子/淹没的)
# 用法: python3 scripts/fix-rows.py <输入图> <输出目录> <行号:0-5> [行号...] -- <属性...54个>
import sys
import os
import importlib.util
import numpy as np
from PIL import Image

_spec = importlib.util.spec_from_file_location('ss', os.path.join(os.path.dirname(__file__), 'split-sheet.py'))
ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ss)


def main():
    argv = sys.argv[1:]
    if '--' in argv:
        i = argv.index('--')
        rows = [int(x) for x in argv[2:i] if not x.startswith('--bounds=')]
        names = argv[i + 1:]
    else:
        print('用法: fix-rows.py <图> <输出目录> <行号...> -- <54个属性>')
        sys.exit(1)
    if len(names) != 54:
        print('!! 需要 54 个属性名')
        sys.exit(1)
    src, outdir = argv[0], argv[1]
    bounds = None
    for a_ in argv[:i]:
        if a_.startswith('--bounds='):
            bounds = [int(x) for x in a_.split('=', 1)[1].split(',')]
    im = Image.open(src)
    rgba = ss.remove_bg_full(im)
    w, h = rgba.size
    hw, hh = w // 2, h // 2
    a = np.asarray(rgba.getchannel('A').resize((hw, hh), Image.NEAREST))
    colw, rowh = hw / 9.0, hh / 6.0
    os.makedirs(outdir, exist_ok=True)
    for r in rows:
        if bounds:
            y0, y1 = max(0, bounds[r]), min(hh, bounds[r + 1])
        else:
            y0, y1 = int(r * rowh), min(hh, int((r + 1) * rowh) + 6)
        for c in range(9):
            idx = r * 9 + c
            name = names[idx]
            # 行带内,列窗口 ± 半列(取窗口中央像素)
            x0 = int(c * colw)
            x1 = int((c + 1) * colw)
            band = a[y0:y1, x0:x1]
            yy, xx = np.nonzero(band > 0)
            if len(yy) < 50:
                print(f'!! {name}: 行带空缺,跳过')
                continue
            # 完整连通域:把窗口内组件延伸到行带全宽(取与窗口像素相连的部分)
            from scipy import ndimage
            bandfull = a[y0:y1, :]
            lab, cnt = ndimage.label(bandfull > 0)
            seed_ids = set(np.unique(lab[yy, xx + x0])) - {0}
            pix = []
            for sid in seed_ids:
                cy, cx = np.nonzero(lab == sid)
                # 组件质心必须在本列窗口内(防止把邻列主体整只带进来)
                mcx = cx.mean()
                if x0 - 4 <= mcx <= x1 + 4:
                    pix += list(zip(cx.tolist(), cy.tolist()))
            if not pix:
                pix = list(zip((xx + x0).tolist(), (yy + y0).tolist()))
            xs_ = [p[0] for p in pix]
            ys_ = [p[1] for p in pix]
            bx = (min(xs_) * 2, (y0 + min(ys_)) * 2, max(xs_) * 2, (y0 + max(ys_)) * 2)
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
