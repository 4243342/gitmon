#!/usr/bin/env python3
"""剧本包立绘素材清洗：抠白底（边缘屏障法）。

为什么不能按「颜色距离」抠白底：
  用户给的立绘多数是 JPG（无透明通道），白底 + 纯白高光。
  这张立绘的白发高光是纯白 255,255,255，和背景白底**同色**。
  按颜色距离算 alpha 会把头发高光一起判成半透明 —— 白底透上来，
  头发上就出现一片麻点（看着像压缩噪点，其实是抠图造成的）。
  连通域扩散也救不了：头发高光和画外白底在某些位置是连通的，
  漫延会从高光处漏进人物内部。

正确做法（边缘屏障法）：
  1. 算亮度梯度，人物真正的边界在深色描边上 → 梯度大
  2. 把梯度大的像素膨胀 1px，当成「屏障」
  3. 从画外对「近白」像素做漫延，遇到屏障就停
     → 屏障把人物圈在里面；白发高光虽然也是白的，但被描边挡住了
  4. 屏障外 = 背景（透明），屏障内 = 人物（不透明）

实测：1086×1448 的白发女立绘，抠完 476×1161，黑斑全清、
描边 / 瞳孔 / 衣纹全部完整。

用法：python3 scripts/art-clean.py <输入> <输出> [--keep-bg]
  --keep-bg 保留原背景（输入已是透明 PNG 时用）
"""
from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from numpy.lib.stride_tricks import sliding_window_view

# 梯度超过这个值算「轮廓线」的一部分
EDGE_GRADIENT = 26.0
# 漫延时认作「背景白」的亮度下限
BG_LUMINANCE = 238.0
# 抠完后的边缘羽化半径（像素）
EDGE_FEATHER = 1.2


def _alpha_by_edge_barrier(rgb: np.ndarray) -> np.ndarray:
    """边缘屏障抠白底：人物靠描边与背景隔开，屏障挡住背景色的漫延。"""
    h, w, _ = rgb.shape
    lum = rgb.mean(axis=2)

    gx = np.zeros_like(lum)
    gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
    gradient = np.sqrt(gx ** 2 + gy ** 2)

    # 轮廓 = 梯度大；再膨胀 1px 让屏障不漏
    strong = (gradient > EDGE_GRADIENT).astype(np.uint8)
    padded = np.pad(strong, 1)
    barrier = sliding_window_view(padded, (3, 3)).max(axis=(2, 3)).astype(bool)

    near_white = lum > BG_LUMINANCE
    outside = np.zeros((h, w), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    for x in range(w):
        for y in (0, h - 1):
            if near_white[y, x] and not barrier[y, x]:
                outside[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_white[y, x] and not barrier[y, x]:
                outside[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if not (0 <= ny < h and 0 <= nx < w):
                continue
            if outside[ny, nx] or not near_white[ny, nx] or barrier[ny, nx]:
                continue
            outside[ny, nx] = True
            queue.append((ny, nx))

    alpha = np.where(outside, 0.0, 1.0)
    # 羽化边缘，避免留一圈锯齿
    return np.asarray(
        Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(EDGE_FEATHER))
    ).astype(np.float32) / 255.0


def clean(src: Path, dst: Path, keep_bg: bool = False) -> None:
    image = Image.open(src)
    if keep_bg:
        rgba = image.convert('RGBA')
        array = np.asarray(rgba).astype(np.float32)
        rgb, alpha = array[:, :, :3], array[:, :, 3] / 255.0
    else:
        rgb = np.asarray(image.convert('RGB')).astype(np.float32)
        alpha = _alpha_by_edge_barrier(rgb)

    merged = Image.merge(
        'RGBA',
        (*[Image.fromarray(rgb[:, :, i].astype(np.uint8)) for i in range(3)],
         Image.fromarray((alpha * 255).astype(np.uint8))),
    )
    box = merged.getbbox()
    if box:
        merged = merged.crop(box)
    dst.parent.mkdir(parents=True, exist_ok=True)
    merged.save(dst)
    print(f'{src.name} → {dst}  {merged.size[0]}×{merged.size[1]}')


def main() -> None:
    parser = argparse.ArgumentParser(description='剧本包立绘清洗：抠白底（边缘屏障法）')
    parser.add_argument('src', type=Path)
    parser.add_argument('dst', type=Path)
    parser.add_argument('--keep-bg', action='store_true', help='保留原背景（输入已透明）')
    args = parser.parse_args()
    clean(args.src, args.dst, keep_bg=args.keep_bg)


if __name__ == '__main__':
    main()
