# 由已切好的 54 张素材拼 6x9 总览图,便于目检
# 用法: python3 scripts/make-overview.py <素材目录> <输出png> [bg=light|dark] [行标签逗号分隔]
import sys
import os
from PIL import Image, ImageDraw, ImageFont

ELEMS = ['water', 'thunder', 'steel', 'earth', 'rock', 'fire', 'wind', 'grass', 'normal']
ROWS = ['base', 's3', 's4', 's5', 's6', 's7']
CELL, LABEL, PAD = 168, 46, 8


def font(sz):
    for p in ['/System/Library/Fonts/PingFang.ttc', '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    d, out = sys.argv[1], sys.argv[2]
    dark = len(sys.argv) > 3 and sys.argv[3] == 'dark'
    rows = sys.argv[4].split(',') if len(sys.argv) > 4 else ROWS
    bg = (28, 31, 38) if dark else (238, 240, 244)
    fg = (220, 224, 232) if dark else (90, 96, 108)
    W = LABEL + 9 * (CELL + PAD) + PAD
    H = 24 + len(rows) * (CELL + PAD) + PAD
    im = Image.new('RGB', (W, H), bg)
    dr = ImageDraw.Draw(im)
    f = font(13)
    for c, e in enumerate(ELEMS):
        dr.text((LABEL + c * (CELL + PAD) + 6, 4), e, fill=fg, font=f)
    for r, tag in enumerate(rows):
        y = 24 + r * (CELL + PAD)
        dr.text((4, y + CELL // 2), tag, fill=fg, font=f)
        for c, e in enumerate(ELEMS):
            name = e if r == 0 else f'{e}-{tag}'
            p = os.path.join(d, name + '.png')
            x = LABEL + c * (CELL + PAD)
            dr.rectangle((x, y, x + CELL - 1, y + CELL - 1),
                         outline=(200, 204, 212) if not dark else (52, 56, 66))
            if not os.path.exists(p):
                dr.text((x + 8, y + CELL // 2), 'MISSING', fill=(220, 80, 80), font=f)
                continue
            t = Image.open(p).convert('RGBA')
            t.thumbnail((CELL - 6, CELL - 6), Image.LANCZOS)
            im.paste(t, (x + (CELL - t.width) // 2, y + (CELL - t.height) // 2), t)
    im.save(out)
    print('->', out, im.size)


if __name__ == '__main__':
    main()
