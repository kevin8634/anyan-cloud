# v1.2.23 新旧对照拼图（黑客松报告 / 朋友圈素材）：标题 + 上下两行（旧 / 新），统一深色底
# 用法：python3 dev/cmpsheet.py 输出.png "标题" 旧图.png 新图.png [副标题]
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, old, new = sys.argv[1:5]
sub = sys.argv[5] if len(sys.argv) > 5 else ''
F = '/workspace/work/fonts/NotoSerifSC-Bold.otf'
a, b = Image.open(old).convert('RGB'), Image.open(new).convert('RGB')
W = max(a.width, b.width)
def fit(im):
    if im.width == W: return im
    h = round(im.height * W / im.width); return im.resize((W, h), Image.LANCZOS)
a, b = fit(a), fit(b)
H0 = 110 if sub else 80
pad = 16
img = Image.new('RGB', (W + pad * 2, H0 + a.height + b.height + pad * 3), (14, 22, 24))
d = ImageDraw.Draw(img)
d.text((pad, 18), title, font=ImageFont.truetype(F, 36), fill=(240, 211, 140))
if sub: d.text((pad, 66), sub, font=ImageFont.truetype(F, 22), fill=(170, 200, 195))
img.paste(a, (pad, H0)); img.paste(b, (pad, H0 + a.height + pad))
tag = ImageFont.truetype(F, 26)
for y, t, c in [(H0, '旧', (150, 150, 150)), (H0 + a.height + pad, '新 · Lux3D', (110, 230, 215))]:
    w = d.textlength(t, font=tag) + 24
    d.rectangle([W + pad - w - 8, y + 8, W + pad - 8, y + 48], fill=(0, 0, 0))
    d.text((W + pad - w + 4, y + 12), t, font=tag, fill=c)
img.save(out); print(out, img.size)
