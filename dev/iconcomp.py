# 11-14d 暗金图标合成：透明底武器渲染 → 与本体图标同风格的 96×96 jpg（暗青底 + 中心微光 + 暗角 + 轻描边投影）
# 用法：python3 dev/iconcomp.py in.png out.jpg [glowhex]
import sys
from PIL import Image, ImageFilter, ImageDraw, ImageChops
src, out = sys.argv[1], sys.argv[2]
glow = tuple(int(sys.argv[3][i:i + 2], 16) for i in (0, 2, 4)) if len(sys.argv) > 3 else (60, 150, 140)
N = 384
bg = Image.new('RGB', (N, N), (20, 27, 35))
# 中心偏亮的径向光
g = Image.new('L', (N, N), 0); ImageDraw.Draw(g).ellipse((N * .12, N * .12, N * .88, N * .88), fill=255)
g = g.filter(ImageFilter.GaussianBlur(N * .16))
bg = Image.composite(Image.new('RGB', (N, N), (40, 58, 62)), bg, g)
im = Image.open(src).convert('RGBA')
a = im.split()[3]
# 武器外圈的品质色微光
halo = a.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(10)).point(lambda v: int(v * .55))
bg = Image.composite(Image.new('RGB', (N, N), glow), bg, halo)
# 投影
sh = a.filter(ImageFilter.GaussianBlur(5)).point(lambda v: int(v * .6))
bg.paste((5, 8, 10), (6, 8), ImageChops.offset(sh, 0, 0))
bg.paste(im, (0, 0), im)
# 暗角
v = Image.new('L', (N, N), 0); ImageDraw.Draw(v).ellipse((-N * .1, -N * .1, N * 1.1, N * 1.1), fill=255)
v = v.filter(ImageFilter.GaussianBlur(N * .12))
bg = Image.composite(bg, Image.new('RGB', (N, N), (10, 14, 18)), v)
bg.resize((96, 96), Image.LANCZOS).save(out, quality=92)
if len(sys.argv) > 4: bg.save(sys.argv[4])   # 可选：大图预览
