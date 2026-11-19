# raidA 11-02 维尔格 / 萨琳 概念图 vs 成品对照图（萨琳共用）：python3 compare.py <概念图.png> <shoot 静帧目录(T 字)> <shoot 静帧目录(待机)> <标题> <输出.jpg>
# 一行：概念图（T 字设定图）| 成品 T 字正面 | 成品待机 正面 / 右前 3/4 / 背面 / 脸部近景；底部一行说明
import sys, os
from PIL import Image, ImageDraw, ImageFont
con, dT, dI, title, out = sys.argv[1:6]; note = sys.argv[6] if len(sys.argv) > 6 else ''
F = '/workspace/work/fonts/NotoSansCJKsc-Regular.otf'; FB = '/workspace/work/fonts/NotoSansCJKsc-Bold.otf'
ft = ImageFont.truetype(FB, 30); fl = ImageFont.truetype(F, 20); fn = ImageFont.truetype(F, 17)
Hc = 640
def fit(p, h=Hc):
    im = Image.open(p).convert('RGB'); w = int(im.width * h / im.height); return im.resize((w, h), Image.LANCZOS)
cells = [(fit(con), '概念图（Lux3D 严格 T 字设定图）'), (fit(os.path.join(dT, 'front.png')), '成品 · T 字绑定姿势 正面')]
for f, l in [('front', '成品 · 待机 正面'), ('q34r', '成品 · 待机 右前 3/4'), ('back', '成品 · 待机 背面'), ('face', '成品 · 脸部近景')]:
    p = os.path.join(dI, f + '.png')
    if os.path.exists(p): cells.append((fit(p), l))
W = sum(c[0].width for c in cells) + 12 * (len(cells) + 1); Ht = Hc + 60 + 40 + 50
can = Image.new('RGB', (W, Ht), (16, 19, 23)); d = ImageDraw.Draw(can)
d.text((14, 12), title, font=ft, fill=(96, 255, 208)); x = 12
for im, l in cells:
    can.paste(im, (x, 60)); d.text((x + 6, 60 + Hc + 8), l, font=fl, fill=(220, 226, 232)); x += im.width + 12
d.text((14, Ht - 40), note, font=fn, fill=(170, 180, 190))
can.save(out, quality=90); print(out, can.size)
