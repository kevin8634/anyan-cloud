# v1.2.25 概念图拼板：python3 dev/board.py 输出.png "标题" 图1.png:标签1 图2.png:标签2 ...（3 列，每格 420）
import sys
from PIL import Image, ImageDraw, ImageFont
out, title, items = sys.argv[1], sys.argv[2], [a.rsplit(':', 1) for a in sys.argv[3:]]
F = '/workspace/work/fonts/NotoSerifSC-'
ft, fl = ImageFont.truetype(F + 'Black.otf', 40), ImageFont.truetype(F + 'Bold.otf', 26)
C, S, P, H = 3, 420, 16, 80
rows = (len(items) + C - 1) // C
im = Image.new('RGB', (C * (S + P) + P, H + rows * (S + 50 + P)), (16, 22, 26)); d = ImageDraw.Draw(im)
d.text((P, 18), title, font=ft, fill=(240, 214, 150))
for i, (f, lab) in enumerate(items):
    x, y = P + (i % C) * (S + P), H + (i // C) * (S + 50 + P)
    im.paste(Image.open(f).convert('RGB').resize((S, S)), (x, y))
    d.text((x + 4, y + S + 8), lab, font=fl, fill=(150, 230, 220))
im.save(out); print(out, im.size)
