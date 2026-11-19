# fix1109c #3：DLC 职业头像（灵契猎手 / 负棺人）—— 0 积分：从 docs/黑客松素材/职业概念/<cls>.png（Lux3D 建模所用的同一张概念图）裁头肩，
#   边缘泛洪去浅色底 → 换成与本体 pt_*.jpg 同风格的暗色径向底 + 暖色边光，输出 128px jpg 到 src/dlc/dlc1/icons/pt_<cls>.jpg
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np
from collections import deque
SRC = 'docs/黑客松素材/职业概念/'
CROP = {'hunter': (377, 18, 647, 288), 'coffin': (370, 48, 660, 338)}   # 1024² 概念图里的头肩框（正方形）
BG = {'hunter': ((70, 78, 66), (14, 16, 14)), 'coffin': ((44, 70, 66), (8, 12, 12))}
def mask_bg(im, thr=28):
    a = np.asarray(im).astype(int); h, w, _ = a.shape
    ref = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    near = (np.abs(a - ref).sum(2) < thr)
    seen = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h - 1): q.append((y, x))
    for y in range(h):
        for x in (0, w - 1): q.append((y, x))
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not near[y, x]: continue
        seen[y, x] = True; q.extend(((y+1, x), (y-1, x), (y, x+1), (y, x-1)))
    return Image.fromarray(((~seen) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
for cls in sys.argv[1:] or CROP:
    im = Image.open(SRC + cls + '.png').convert('RGB')
    m = mask_bg(im)
    im, m = im.crop(CROP[cls]), m.crop(CROP[cls])
    S = im.size[0]
    c0, c1 = BG[cls]
    yy, xx = np.mgrid[0:S, 0:S]; d = np.clip(np.hypot(xx - S * .5, yy - S * .42) / (S * .72), 0, 1)[..., None]
    bg = Image.fromarray((np.array(c0) * (1 - d) + np.array(c1) * d).astype(np.uint8))
    # 暖色边光（与本体头像的烛光边一致）：蒙版外扩一圈染金
    rim = ImageChops.subtract(m.filter(ImageFilter.MaxFilter(7)), m).filter(ImageFilter.GaussianBlur(3))
    bg = Image.composite(Image.new('RGB', (S, S), (200, 150, 70)), bg, rim.point(lambda v: int(v * .45)))
    out = Image.composite(im, bg, m)
    # 轻微压暗 / 加对比，接近手绘头像的明暗
    a = np.asarray(out).astype(float) / 255; a = np.clip((a - .5) * 1.12 + .47, 0, 1)
    out = Image.fromarray((a * 255).astype(np.uint8)).resize((128, 128), Image.LANCZOS)
    out.save(f'src/dlc/dlc1/icons/pt_{cls}.jpg', quality=90)
    print('pt_' + cls, out.size)
