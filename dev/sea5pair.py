# 海底第五轮并排拼图：左 = 概念图，右 = 游戏内截图，各自带中文标签
# 用法：python3 dev/sea5pair.py 输出.png 标题 概念图 概念标签 截图 截图标签 [截图2 标签2 ...]
import sys, os
from PIL import Image, ImageDraw, ImageFont
out, title = sys.argv[1:3]; rest = sys.argv[3:]
pairs = [(rest[i], rest[i + 1]) for i in range(0, len(rest), 2)]
H, pad, top, lab = 720, 14, 56, 40
try: F = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 28); f2 = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 22)
except Exception: F = f2 = ImageFont.load_default()
ims = []
for p, t in pairs:
    im = Image.open(p).convert('RGB'); ims.append((im.resize((round(im.width * H / im.height), H), Image.LANCZOS), t))
W = pad + sum(i.width + pad for i, _ in ims)
img = Image.new('RGB', (W, top + lab + H + pad), (14, 22, 24)); d = ImageDraw.Draw(img)
d.text((pad, 12), title, font=F, fill=(240, 211, 140))
x = pad
for im, t in ims:
    d.text((x, top + 4), t, font=f2, fill=(200, 230, 225)); img.paste(im, (x, top + lab)); x += im.width + pad
img.save(out); print(out, img.size)
