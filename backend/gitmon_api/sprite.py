"""服务端像素立绘：把前端算法原样移植成纯 Python。

两种风格：
- classic（默认）：与 `src/sprite.js` 的 16×16 生成器逐像素一致，画布和 PNG 长得一样
- rich：32×32 分层绘制（体型骨架 → 明暗 → 描边 → 五官 → 进化装饰），细节更多，
  用 GITMON_SPRITE_STYLE=rich 打开

零第三方依赖：自己用 zlib 写 PNG，容器镜像里不需要 Pillow。
"""

from __future__ import annotations

import math
import struct
import zlib
from typing import Any, Iterable

from .engine import make_rng

RGB = tuple[int, int, int]
Grid = list[list[RGB | None]]

CLASSIC_SIZE = 16
RICH_SIZE = 32

WHITE: RGB = (250, 250, 255)
PUPIL: RGB = (24, 26, 46)
GLINT: RGB = (255, 255, 255)
EYE: RGB = (26, 26, 46)

RICH_CROWN_Y = {"biped": 4, "winged": 7, "slime": 11, "quadruped": 7, "golem": 6, "spirit": None}


# ---------------------------------------------------------------- 颜色与几何工具

def _round(value: float) -> int:
    return int(math.floor(value + 0.5))


def hex_to_rgb(value: str) -> RGB:
    text = (value or "#b8b8b8").lstrip("#")
    if len(text) == 3:
        text = "".join(ch * 2 for ch in text)
    try:
        return (int(text[0:2], 16), int(text[2:4], 16), int(text[4:6], 16))
    except (ValueError, IndexError):
        return (184, 184, 184)


def _byte(value: float) -> int:
    return max(0, min(255, int(value)))


def mix(base: RGB, other: RGB, t: float) -> RGB:
    return (
        _byte(base[0] + (other[0] - base[0]) * t),
        _byte(base[1] + (other[1] - base[1]) * t),
        _byte(base[2] + (other[2] - base[2]) * t),
    )


def shade(color: RGB, factor: float) -> RGB:
    """对齐前端 `Math.min(255, r * f) | 0`（截断而非四舍五入）。"""
    return (min(255, int(color[0] * factor)), min(255, int(color[1] * factor)), min(255, int(color[2] * factor)))


def css(color: RGB | None) -> str:
    if color is None:
        return "none"
    return f"rgb({color[0]},{color[1]},{color[2]})"


def _blank(size: int) -> Grid:
    return [[None] * size for _ in range(size)]


# ---------------------------------------------------------------- classic：16×16（与前端一致）

def render_classic(*, sprite_seed: int, color: str, body: str, stage: int = 1) -> Grid:
    size = CLASSIC_SIZE
    grid = _blank(size)
    rng = make_rng(sprite_seed)
    rgb = hex_to_rgb(color)
    body_c = shade(rgb, 1.0)
    dark_c = shade(rgb, 0.62)
    lite_c = shade(rgb, 1.45)
    half = size // 2

    def put(x: int, y: int, value: RGB | None) -> None:
        if 0 <= x < size and 0 <= y < size:
            grid[y][x] = value

    for y in range(size):
        for x in range(half):
            nx = (half - x) / half
            ny = abs(y - size * 0.55) / (size * 0.5)
            if body == "slime":
                inside = ny < 0.75 - nx * 0.35 and y > 2
            elif body == "biped":
                inside = (ny < 0.62 - nx * 0.3 and y > 2) or (y > size - 4 and nx < 0.5)
            elif body == "quadruped":
                inside = ny < 0.5 - nx * 0.2 and 3 < y < size - 3
            elif body == "winged":
                inside = (ny < 0.55 - nx * 0.25 and y > 3) or (nx > 0.55 and ny < 0.45 and y > 1)
            elif body == "golem":
                inside = ny < 0.7 and y > 2 and nx < 0.85
            elif body == "spirit":
                inside = ny < 0.6 - nx * 0.4 and y > 1
            else:
                inside = ny < 0.6 - nx * 0.3
            if inside and rng() > 0.08:
                roll = rng()
                cell = dark_c if roll < 0.12 else lite_c if roll < 0.2 else body_c
                put(x, y, cell)
                put(size - 1 - x, y, cell)

    eye_y = 5 + int(rng() * 3)
    eye_x = half - 2 - int(rng() * 2)
    put(eye_x, eye_y, EYE)
    put(size - 1 - eye_x, eye_y, EYE)
    if stage >= 2:
        put(eye_x, eye_y + 1, EYE)
        put(size - 1 - eye_x, eye_y + 1, EYE)

    if stage >= 2:
        for x, y in ((half - 1, 1), (half, 1), (half - 1, 0), (half, 0)):
            put(x, y, lite_c)
    if stage >= 3:
        for x in range(1, 4):
            put(x, 4, lite_c)
            put(size - 1 - x, 4, lite_c)
        for x in range(3, size - 3):
            if x % 2 == 0:
                put(x, size - 1, lite_c)

    return grid


# ---------------------------------------------------------------- rich：32×32 分层绘制

def _rich_px(grid: Grid, x: float, y: float, color: RGB | None) -> None:
    xi, yi = _round(x), _round(y)
    if 0 <= xi < RICH_SIZE and 0 <= yi < RICH_SIZE and color is not None:
        grid[yi][xi] = color


def _rich_ellipse(grid: Grid, cx: float, cy: float, rx: float, ry: float, color: RGB | None) -> None:
    if rx <= 0 or ry <= 0:
        return
    for y in range(RICH_SIZE):
        for x in range(RICH_SIZE):
            dx = (x + 0.5 - cx) / rx
            dy = (y + 0.5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                _rich_px(grid, x, y, color)


def _rich_capsule(grid: Grid, x1: float, y1: float, x2: float, y2: float, radius: float,
                  color: RGB | None) -> None:
    steps = 40
    for i in range(steps + 1):
        t = i / steps
        _rich_ellipse(grid, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, radius, radius, color)


def _rich_tri(grid: Grid, ax: float, ay: float, bx: float, by: float, cx: float, cy: float,
              color: RGB | None) -> None:
    for y in range(math.floor(min(ay, by, cy)), math.ceil(max(ay, by, cy)) + 1):
        for x in range(math.floor(min(ax, bx, cx)), math.ceil(max(ax, bx, cx)) + 1):
            px_, py_ = x + 0.5, y + 0.5
            d1 = (px_ - bx) * (ay - by) - (ax - bx) * (py_ - by)
            d2 = (px_ - cx) * (by - cy) - (bx - cx) * (py_ - cy)
            d3 = (px_ - ax) * (cy - ay) - (cx - ax) * (py_ - ay)
            neg = d1 < 0 or d2 < 0 or d3 < 0
            pos = d1 > 0 or d2 > 0 or d3 > 0
            if not (neg and pos):
                _rich_px(grid, x, y, color)


def _rich_rect(grid: Grid, x: float, y: float, w: float, h: float, color: RGB | None) -> None:
    for j in range(int(y), int(y + h)):
        for i in range(int(x), int(x + w)):
            _rich_px(grid, i, j, color)


def _rich_body(grid: Grid, body: str, palette: dict[str, RGB], rng) -> None:
    base, accent = palette["base"], palette["accent"]

    def jitter() -> float:
        return (rng() - 0.5) * 2.0

    if body == "biped":
        _rich_ellipse(grid, 16 + jitter(), 11, 6.5, 6, base)
        _rich_ellipse(grid, 16 + jitter(), 22, 7.5, 7, base)
        _rich_capsule(grid, 10, 17, 7, 23, 1.6, base)
        _rich_capsule(grid, 22, 17, 25, 23, 1.6, base)
        _rich_capsule(grid, 13, 27, 12, 31, 1.9, base)
        _rich_capsule(grid, 19, 27, 20, 31, 1.9, base)
        _rich_tri(grid, 10, 7, 12, 2, 14, 7, base)
        _rich_tri(grid, 22, 7, 20, 2, 18, 7, base)
    elif body == "winged":
        _rich_ellipse(grid, 16 + jitter(), 20, 6, 8, base)
        _rich_ellipse(grid, 16, 11, 4.5, 4.5, base)
        _rich_tri(grid, 9, 20, 1, 12, 5, 24, base)
        _rich_tri(grid, 23, 20, 31, 12, 27, 24, base)
        _rich_tri(grid, 12, 26, 16, 32, 20, 26, base)
        _rich_tri(grid, 14, 11, 18, 11, 16, 14, accent)
    elif body == "slime":
        _rich_ellipse(grid, 16, 20, 9.5, 8, base)
        _rich_ellipse(grid, 16, 17, 8, 7, base)
        _rich_capsule(grid, 9, 27, 8, 31, 2, base)
        _rich_capsule(grid, 23, 28, 24, 31, 1.6, base)
        _rich_tri(grid, 16, 13, 20, 19, 12, 19, accent)
    elif body == "quadruped":
        _rich_ellipse(grid, 16 + jitter(), 21, 8.5, 6, base)
        _rich_capsule(grid, 18, 16, 20, 11, 3.2, base)
        _rich_ellipse(grid, 21, 8, 5, 4.5, base)
        _rich_capsule(grid, 11, 23, 10, 30, 2, base)
        _rich_capsule(grid, 16, 24, 16, 31, 2, base)
        _rich_capsule(grid, 21, 24, 22, 30, 2, base)
        _rich_capsule(grid, 8, 20, 2, 15, 2.2, base)
        _rich_tri(grid, 19, 5, 24, 2, 23, 7, accent)
        _rich_tri(grid, 24, 6, 26, 3, 26, 8, accent)
    elif body == "golem":
        _rich_rect(grid, 9, 13, 14, 13, base)
        _rich_rect(grid, 12, 5, 9, 8, base)
        _rich_rect(grid, 4, 16, 5, 9, base)
        _rich_rect(grid, 23, 16, 5, 9, base)
        _rich_rect(grid, 12, 26, 4, 5, base)
        _rich_rect(grid, 18, 26, 4, 5, base)
        _rich_ellipse(grid, 16, 19, 3, 3, accent)
    elif body == "spirit":
        _rich_ellipse(grid, 16 + jitter(), 17, 7, 7.5, base)
        _rich_tri(grid, 10, 22, 16, 32, 22, 22, base)
        _rich_ellipse(grid, 16, 7, 6.5, 1.6, accent)
    else:
        _rich_ellipse(grid, 16, 20, 8, 8, base)
        _rich_ellipse(grid, 16, 11, 5, 5, base)


def _rich_shade(grid: Grid, palette: dict[str, RGB]) -> None:
    base, light, dark = palette["base"], palette["light"], palette["dark"]
    snapshot = [row[:] for row in grid]
    for y in range(RICH_SIZE):
        for x in range(RICH_SIZE):
            if snapshot[y][x] is None:
                continue
            above = snapshot[y - 1][x] if y > 0 else None
            left = snapshot[y][x - 1] if x > 0 else None
            below_empty = y == RICH_SIZE - 1 or snapshot[y + 1][x] is None
            right_empty = x == RICH_SIZE - 1 or snapshot[y][x + 1] is None
            if above is None or left is None:
                grid[y][x] = light
            elif below_empty or right_empty:
                grid[y][x] = dark
            elif snapshot[y][x] == base and (x + y) % 11 == 0:
                grid[y][x] = light


def _rich_marks(grid: Grid, palette: dict[str, RGB], rng) -> None:
    base, accent = palette["base"], palette["accent"]
    for _ in range(3 + int(rng() * 4)):
        x = 3 + int(rng() * 26)
        y = 5 + int(rng() * 24)
        if 0 <= y < RICH_SIZE and 0 <= x < RICH_SIZE and grid[y][x] == base:
            grid[y][x] = accent


def _rich_outline(grid: Grid, color: RGB) -> None:
    snapshot = [row[:] for row in grid]
    for y in range(RICH_SIZE):
        for x in range(RICH_SIZE):
            if snapshot[y][x] is not None:
                continue
            adjacent = (
                (y > 0 and snapshot[y - 1][x] is not None)
                or (y < RICH_SIZE - 1 and snapshot[y + 1][x] is not None)
                or (x > 0 and snapshot[y][x - 1] is not None)
                or (x < RICH_SIZE - 1 and snapshot[y][x + 1] is not None)
            )
            if adjacent:
                grid[y][x] = color


def _rich_eyes(grid: Grid, body: str, stage: int, eye_pos: tuple[int, int],
               palette: dict[str, RGB]) -> None:
    ex, ey = eye_pos
    big = stage >= 2
    mouth = palette["dark"]

    def eye(x: int, y: int) -> None:
        for dx, dy in ((0, 0), (1, 0), (0, 1), (1, 1)):
            _rich_px(grid, x + dx, y + dy, WHITE)
        if big:
            _rich_px(grid, x, y + 2, WHITE)
            _rich_px(grid, x + 1, y + 2, WHITE)
        _rich_px(grid, x, y, PUPIL)
        if big:
            _rich_px(grid, x, y + 1, PUPIL)
        _rich_px(grid, x, y - 1, GLINT)

    eye(ex, ey)
    eye(RICH_SIZE - 3 - ex, ey)

    if body in ("bird", "slime"):
        _rich_px(grid, 15, ey + 3, mouth)
        _rich_px(grid, 16, ey + 3, mouth)
    elif stage >= 3:
        for x in (15, 16, 17):
            _rich_px(grid, x, ey + 4, mouth)
    else:
        _rich_px(grid, 16, ey + 4, mouth)


def _rich_decor(grid: Grid, body: str, stage: int, palette: dict[str, RGB]) -> None:
    if stage >= 2:
        y = RICH_CROWN_Y.get(body)
        if y is not None:
            _rich_tri(grid, 14, y, 16, y - 4, 18, y, palette["accent"])
        else:
            _rich_ellipse(grid, 16, 5, 4.5, 1.2, palette["accent"])
    if stage >= 3:
        _rich_rect(grid, 6, 15, 3, 3, palette["accent"])
        _rich_rect(grid, 23, 15, 3, 3, palette["accent"])
        _rich_px(grid, 3, 8, palette["light"])
        _rich_px(grid, 28, 9, palette["light"])
        _rich_px(grid, 2, 24, palette["accent"])
        _rich_px(grid, 29, 25, palette["accent"])


def _rich_core(grid: Grid, body: str, palette: dict[str, RGB]) -> None:
    if body == "slime":
        _rich_tri(grid, 16, 14, 19, 19, 13, 19, palette["accent"])
        _rich_px(grid, 16, 17, (255, 255, 255))
    if body == "golem":
        _rich_ellipse(grid, 16, 19, 2.6, 2.6, palette["accent"])
        _rich_px(grid, 16, 19, (255, 255, 255))


def render_rich(*, sprite_seed: int, color: str, body: str, stage: int = 1) -> Grid:
    rng = make_rng(sprite_seed)
    rgb = hex_to_rgb(color)
    palette = {
        "base": mix(rgb, (255, 255, 255), 0.08),
        "light": mix(rgb, (255, 255, 255), 0.45),
        "dark": mix(rgb, (0, 0, 0), 0.42),
        "accent": mix(rgb, (255, 255, 255), 0.7),
        "outline": mix(rgb, (10, 12, 20), 0.75),
    }
    grid = _blank(RICH_SIZE)
    _rich_body(grid, body, palette, rng)
    _rich_shade(grid, palette)
    _rich_marks(grid, palette, rng)
    _rich_decor(grid, body, stage, palette)
    _rich_outline(grid, palette["outline"])
    _rich_core(grid, body, palette)

    eye_pos = (
        (18, 7) if body == "quadruped"
        else (13, 8) if body == "golem"
        else (12, 17) if body == "slime"
        else (13, 10) if body == "bird"
        else (12, 15) if body == "spirit"
        else (12, 10)
    )
    _rich_eyes(grid, body, stage, eye_pos, palette)
    return grid


# ---------------------------------------------------------------- 对外接口

def _style_of(style: str | None) -> str:
    if style:
        return style
    from .config import settings

    return getattr(settings, "sprite_style", "classic")


def render_grid(*, sprite_seed: int, color: str, body: str, stage: int = 1, style: str = "") -> Grid:
    if _style_of(style) == "rich":
        return render_rich(sprite_seed=sprite_seed, color=color, body=body, stage=stage)
    return render_classic(sprite_seed=sprite_seed, color=color, body=body, stage=stage)


def _png_chunk(tag: bytes, payload: bytes) -> bytes:
    return (struct.pack(">I", len(payload)) + tag + payload
            + struct.pack(">I", zlib.crc32(tag + payload) & 0xFFFFFFFF))


def encode_png(grid: Grid, scale: int = 8) -> bytes:
    size = len(grid)
    width = height = size * scale
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # filter type 0
        source_row = grid[y // scale]
        for x in range(width):
            pixel = source_row[x // scale]
            if pixel is None:
                rows.extend((0, 0, 0, 0))
            else:
                rows.extend((pixel[0], pixel[1], pixel[2], 255))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(bytes(rows), 9))
        + _png_chunk(b"IEND", b"")
    )


def sprite_png(*, sprite_seed: int, color: str, body: str, stage: int = 1,
               scale: int = 8, style: str = "") -> bytes:
    grid = render_grid(sprite_seed=sprite_seed, color=color, body=body, stage=stage, style=style)
    return encode_png(grid, scale=scale)


def sprite_svg(*, sprite_seed: int, color: str, body: str, stage: int = 1,
               x: int = 0, y: int = 0, size: int = 64, style: str = "") -> str:
    """内联 SVG 版立绘，给徽章/卡片复用（像素用 rect 画，无需图片）。"""
    grid = render_grid(sprite_seed=sprite_seed, color=color, body=body, stage=stage, style=style)
    unit = size / len(grid)
    parts = [f'<g transform="translate({x},{y})" shape-rendering="crispEdges">']
    for row_index, row in enumerate(grid):
        for col_index, pixel in enumerate(row):
            if pixel is None:
                continue
            parts.append(
                f'<rect x="{col_index * unit:.3f}" y="{row_index * unit:.3f}" '
                f'width="{unit:.3f}" height="{unit:.3f}" fill="{css(pixel)}"/>'
            )
    parts.append("</g>")
    return "".join(parts)


def iter_pixels(grid: Grid) -> Iterable[tuple[int, int, RGB]]:
    for y, row in enumerate(grid):
        for x, pixel in enumerate(row):
            if pixel is not None:
                yield x, y, pixel


def dominant_colors(grid: Grid) -> dict[str, Any]:
    counts: dict[RGB, int] = {}
    for _, _, pixel in iter_pixels(grid):
        counts[pixel] = counts.get(pixel, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
    return {"colors": [{"rgb": css(color), "count": count} for color, count in ranked[:5]]}
