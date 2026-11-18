#!/usr/bin/env python3
# 切分九宫格/网格精灵贴纸 → src/assets/species/<种族>/<属性>.png
# 用法: python3 scripts/split-sheet.py <输入图> <输出种族目录> <属性1> <属性2> ...
#       属性按行优先顺序对应格子里的小精灵
# 策略: 不按网格等分切割(避免切断贴边精灵、让抠底白水从切口灌进去吃掉浅色部件),
#       而是整图抠底后按连通域找出 N 个独立精灵,按质心行列排序对号入座;
#       近邻小装饰(气泡/星星)按距离合并进所属精灵的裁剪框
# 处理: 整图边缘 floodfill 抠白底 → 半分辨率连通域分组 → 裁剪
#       → 贴边碎片清除/去斑(腐蚀断颈→删小块→膨胀还原) → 归一化 512x512 透明 PNG
import sys
import os
from PIL import Image, ImageDraw, ImageFilter

MAGIC = (255, 0, 254)  # 抠底标记色,避开纯美术色
CANVAS = 512
CONTENT = 410          # 内容最长边目标(≈80% 画布)
BOTTOM_PAD = 41        # 脚底距画布底 8%
BG_THRESH = 90         # 大容差:连软阴影一起吃,整图抠底不会从切口伤到精灵
BG_COLOR = None        # 深色底时记录底色,供封闭口袋清除用


def _dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2


def remove_bg_full(im):
    global BG_COLOR
    rgb = im.convert('RGB')
    w, h = rgb.size
    px0 = rgb.getpixel((3, 3))
    bright_bg = min(px0) > 150          # 白/浅底 vs 深色底
    BG_COLOR = None if bright_bg else px0
    seeds = []
    for x in range(0, w, 3):
        seeds += [(x, 0), (x, h - 1)]
    for y in range(0, h, 3):
        seeds += [(0, y), (w - 1, y)]
    for s in seeds:
        p = rgb.getpixel(s)
        if bright_bg:
            ok = min(p) > 150 and max(p) - min(p) < 60
            thresh = 90
        else:
            ok = _dist2(p, px0) < 30 ** 2   # 紧贴底色的种子,严防吃进深色描边
            thresh = 26
        if ok:
            ImageDraw.floodfill(rgb, s, MAGIC, thresh=thresh)
    d = rgb.load()
    for y in range(h):          # 清边框环残渣
        for x in (0, 1, w - 2, w - 1):
            d[x, y] = MAGIC
    for x in range(w):
        for y in (0, 1, h - 2, h - 1):
            d[x, y] = MAGIC
    rgba = rgb.convert('RGBA')
    pm = rgba.load()
    for y in range(h):
        for x in range(w):
            if pm[x, y][:3] == MAGIC:
                pm[x, y] = (0, 0, 0, 0)
    return rgba


def _flood_pixels(sx, sy, busy):
    stack = [(sx, sy)]
    pix = []
    while stack:
        x, y = stack.pop()
        if busy(x, y):
            continue
        pix.append((x, y))
        stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    return pix


def label_components_rgba(rgba):
    w, h = rgba.size
    d = rgba.load()
    seen = [[False] * w for _ in range(h)]

    def busy(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return True
        if seen[y][x] or d[x, y][3] == 0:
            return True
        seen[y][x] = True
        return False

    return [_flood_pixels(x, y, busy)
            for y in range(h) for x in range(w)
            if not seen[y][x] and d[x, y][3] > 0]


def label_components_gray(gray):
    w, h = gray.size
    px = gray.load()
    seen = [[False] * w for _ in range(h)]

    def busy(x, y):
        if x < 0 or y < 0 or x >= w or y >= h:
            return True
        if seen[y][x] or px[x, y] == 0:
            return True
        seen[y][x] = True
        return False

    return [_flood_pixels(x, y, busy)
            for y in range(h) for x in range(w)
            if not seen[y][x] and px[x, y] > 0]


label_components = label_components_gray  # 通用:半分辨率 alpha 掩码也是灰度图


def drop_pockets(rgba):
    # 清除被精灵包围的封闭底色口袋:以「几乎=底色」的像素为种子扩散填充,
    # 填充区域平均色仍接近底色才删除(防止误吃铠甲等深色部件)
    if BG_COLOR is None:
        return rgba
    w, h = rgba.size
    d = rgba.load()
    handled = [[False] * w for _ in range(h)]
    for sy in range(h):
        for sx in range(w):
            p = d[sx, sy]
            if p[3] == 0 or handled[sy][sx] or _dist2(p[:3], BG_COLOR) >= 14 ** 2:
                continue
            stack = [(sx, sy)]
            comp = []
            while stack:
                x, y = stack.pop()
                if not (0 <= x < w and 0 <= y < h) or handled[y][x]:
                    continue
                q = d[x, y]
                if q[3] == 0 or _dist2(q[:3], BG_COLOR) >= 14 ** 2:
                    continue
                handled[y][x] = True
                comp.append((x, y))
                stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
            if len(comp) < 40:
                continue
            xs = [c[0] for c in comp]
            ys = [c[1] for c in comp]
            x0, x1 = max(0, min(xs) - 6), min(w, max(xs) + 7)
            y0, y1 = max(0, min(ys) - 6), min(h, max(ys) + 7)
            work = rgba.crop((x0, y0, x1, y1)).convert('RGB')
            cx, cy = sum(xs) // len(comp) - x0, sum(ys) // len(comp) - y0
            ImageDraw.floodfill(work, (cx, cy), MAGIC, thresh=12)
            wp = work.load()
            region = []
            rs = gs = bs = 0
            for yy in range(y1 - y0):
                for xx in range(x1 - x0):
                    if wp[xx, yy][:3] == MAGIC:
                        o = d[x0 + xx, y0 + yy]
                        if o[3] > 0:
                            rs += o[0]; gs += o[1]; bs += o[2]
                            region.append((x0 + xx, y0 + yy))
            if len(region) >= 40 and _dist2((rs / len(region), gs / len(region), bs / len(region)), BG_COLOR) < 20 ** 2:
                for x, y in region:
                    o = d[x, y]
                    d[x, y] = (o[0], o[1], o[2], 0)


def clean_tile(rgba):
    # 封闭底色口袋清除 + 贴边碎片清除 + 去斑
    w, h = rgba.size
    d = rgba.load()
    drop_pockets(rgba)
    edge = 4
    for comp in label_components_rgba(rgba):
        touches = any(x < edge or y < edge or x >= w - edge or y >= h - edge
                      for x, y in comp)
        if (touches and len(comp) < 2500) or len(comp) < 120:
            for x, y in comp:
                d[x, y] = (0, 0, 0, 0)
    a = rgba.getchannel('A')
    er = a.filter(ImageFilter.MinFilter(3))
    px = er.load()
    for comp in label_components_gray(er):
        if len(comp) < 150:
            for x, y in comp:
                px[x, y] = 0
    re = er.filter(ImageFilter.MaxFilter(3))
    rp = re.load()
    for y in range(h):
        for x in range(w):
            r, g, b, al = d[x, y]
            na = min(al, rp[x, y])
            if na != al:
                d[x, y] = (r, g, b, na)
    return rgba


def normalize(tile):
    bbox = tile.getbbox()
    if not bbox:
        return None
    content = tile.crop(bbox)
    w, h = content.size
    scale = min(CONTENT / w, CONTENT / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    content = content.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(content, ((CANVAS - nw) // 2, CANVAS - BOTTOM_PAD - nh), content)
    return out


def main():
    src, outdir, *names = sys.argv[1:]
    im = Image.open(src)
    if len(names) == 1:
        # 单图模式:整张图就是一个精灵,不做连通域分组(保留远处的环绕装饰)
        out = normalize(clean_tile(remove_bg_full(im)))
        if out is None:
            print(f'!! {names[0]}: 空图,跳过')
            sys.exit(1)
        os.makedirs(outdir, exist_ok=True)
        out.save(os.path.join(outdir, f'{names[0]}.png'))
        bb = out.getbbox()
        print(f'-> {names[0]}.png  内容 {bb[2]-bb[0]}x{bb[3]-bb[1]}')
        return
    n = len(names)
    if n % 9 == 0 and n > 9:
        cols, rows = 9, n // 9      # 全套表:9 属性 × N 阶
    elif n <= 9:
        cols, rows = 3, (n + 2) // 3
    else:
        cols, rows = 4, (n + 3) // 4
    im = Image.open(src)
    rgba = remove_bg_full(im)
    w, h = rgba.size
    # 半分辨率连通域分组(提速),坐标 ×2 还原
    hw, hh = w // 2, h // 2
    mask = rgba.getchannel('A').resize((hw, hh), Image.NEAREST)
    comps = [c for c in label_components(mask) if len(c) >= 12]
    comps.sort(key=len, reverse=True)
    erode_k = 0
    if len(comps) < n:
        # 精灵互相接触导致连通域合并 → 逐级腐蚀掩码分离,定位后再扩回腐蚀量
        for k in range(1, 15):
            er = mask.filter(ImageFilter.MinFilter(3))
            for _ in range(k - 1):
                er = er.filter(ImageFilter.MinFilter(3))
            cs = [c for c in label_components(er) if len(c) >= 12]
            cs.sort(key=len, reverse=True)
            if len(cs) >= n:
                comps, erode_k = cs, k
                break
        if len(comps) < n:
            print(f'!! 只找到 {len(comps)} 个独立精灵,需要 {n} 个')
            sys.exit(1)
        if erode_k:
            print(f'.. 精灵粘连,腐蚀 {erode_k} 轮分离')
    grow = erode_k * 2 + 6  # 扩回腐蚀量 + 常规余量(半分辨率坐标 ×2)
    # 主精灵 bbox(全分辨率坐标)
    boxes = []
    for m in comps[:n]:
        xs = [p[0] for p in m]
        ys = [p[1] for p in m]
        bx = (min(xs) * 2, min(ys) * 2, max(xs) * 2, max(ys) * 2)
        cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
        boxes.append([bx, (cx, cy)])
    # 近邻装饰(气泡/星星)按质心距主框最近且 <160px 合并进裁剪框
    for c in comps[n:]:
        xs = [p[0] for p in c]
        ys = [p[1] for p in c]
        cb = (min(xs) * 2, min(ys) * 2, max(xs) * 2, max(ys) * 2)
        ccx, ccy = (cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2
        best, bd = None, 1e18
        for b in boxes:
            dx = max(b[0][0] - ccx, 0, ccx - b[0][2])
            dy = max(b[0][1] - ccy, 0, ccy - b[0][3])
            dist = dx * dx + dy * dy
            if dist < bd:
                best, bd = b, dist
        if best is not None and bd < 160 ** 2:
            nb = (min(best[0][0], cb[0]), min(best[0][1], cb[1]),
                  max(best[0][2], cb[2]), max(best[0][3], cb[3]))
            best[0] = nb
            best[1] = ((nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2)
    # 行列排序对号入座
    boxes.sort(key=lambda b: b[1][1])
    ordered = []
    for i in range(rows):
        row = sorted(boxes[i * cols:(i + 1) * cols], key=lambda b: b[1][0])
        ordered += row
    os.makedirs(outdir, exist_ok=True)
    for name, b in zip(names, ordered):
        bx = b[0]
        pad = max(8, grow)
        tile = rgba.crop((max(0, bx[0] - pad), max(0, bx[1] - pad),
                          min(w, bx[2] + pad), min(h, bx[3] + pad)))
        out = normalize(clean_tile(tile))
        if out is None:
            print(f'!! {name}: 空区域,跳过')
            continue
        out.save(os.path.join(outdir, f'{name}.png'))
        bb = out.getbbox()
        print(f'-> {name}.png  内容 {bb[2]-bb[0]}x{bb[3]-bb[1]}')


if __name__ == '__main__':
    main()
