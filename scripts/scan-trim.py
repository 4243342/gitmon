import sys, os
from PIL import Image
import numpy as np

BASE = "/Users/a4243342/WorkBuddy/2026-11-06-16-53-04/gitmon/src/assets/species"
suspects = []
for fam in sorted(os.listdir(BASE)):
    d = os.path.join(BASE, fam)
    if not os.path.isdir(d): continue
    for f in sorted(os.listdir(d)):
        if not f.endswith(".png"): continue
        p = os.path.join(d, f)
        im = Image.open(p).convert("RGBA")
        a = np.array(im)[:, :, 3]
        ys, xs = np.where(a > 10)
        if len(ys) == 0: continue
        top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
        h, w = a.shape
        flags = []
        if top <= 1: flags.append("TOP")
        if bot >= h - 2: flags.append("BOT")
        if left <= 1: flags.append("LEFT")
        if right >= w - 2: flags.append("RIGHT")
        if flags:
            suspects.append((fam, f, flags, top, h))
print(f"total suspects: {len(suspects)}")
for fam, f, flags, top, h in suspects:
    print(f"{fam}/{f}  {','.join(flags)}  top={top} h={h}")
