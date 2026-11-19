# 海底场景对比图：左 = 概念图，右 = 改后截图（上下两张），深色底 + 标注
# 用法：python3 dev/seacompare.py 输出.png 概念图 右上.png 右下.png [标题]
import sys
from PIL import Image, ImageDraw, ImageFont
out, concept, a, b = sys.argv[1:5]
title = sys.argv[5] if len(sys.argv) > 5 else '左：概念图　右：游戏内（ultra）'
H, pad, top = 1100, 12, 52
c = Image.open(concept).convert('RGB'); c = c.resize((round(c.width * H / c.height), H), Image.LANCZOS)
rh = (H - pad) // 2
def fit(p):
    im = Image.open(p).convert('RGB'); return im.resize((round(im.width * rh / im.height), rh), Image.LANCZOS)
ra, rb = fit(a), fit(b)
W = pad + c.width + pad + max(ra.width, rb.width) + pad
img = Image.new('RGB', (W, top + H + pad), (14, 22, 24)); d = ImageDraw.Draw(img)
try: F = ImageFont.truetype(__import__('os').path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 26)
except Exception: F = ImageFont.load_default()
d.text((pad, 12), title, font=F, fill=(240, 211, 140))
img.paste(c, (pad, top)); x = pad * 2 + c.width
img.paste(ra, (x, top)); img.paste(rb, (x, top + rh + pad))
img.save(out)
print(out, img.size)
