# A7 验收对比图拼版：python3 dev/a7compose.py <输出.jpg> "标题" 行1左图 行1右图 "左说明" "右说明" "行标题" [下一行 ...]
# 每行 5 个参数：左图、右图、左说明、右说明、行标题。左 = A6（之前），右 = A7（之后）
import sys
from PIL import Image, ImageDraw, ImageFont
F = '/home/sandbox/.fonts/NotoSansSC-Bold.otf'
out, title, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
rows = [rest[i:i + 5] for i in range(0, len(rest), 5)]
W, H, PAD, CAP, HEAD = 780, 439, 10, 34, 40
ft, fh, fc = ImageFont.truetype(F, 30), ImageFont.truetype(F, 24), ImageFont.truetype(F, 19)
canvas = Image.new('RGB', (PAD * 3 + W * 2, 60 + len(rows) * (HEAD + H + CAP + PAD)), (16, 16, 18))
d = ImageDraw.Draw(canvas); d.text((PAD, 12), title, font=ft, fill=(240, 236, 228))
y = 60
for l, r, lc, rc, head in rows:
    d.text((PAD, y + 4), head, font=fh, fill=(245, 245, 245)); y += HEAD
    for k, (img, cap, col) in enumerate([(l, lc, (255, 150, 140)), (r, rc, (120, 240, 210))]):
        x = PAD + k * (W + PAD)
        im = Image.open(img).convert('RGB').resize((W, H), Image.LANCZOS); canvas.paste(im, (x, y))
        d.rectangle([x, y + H, x + W, y + H + CAP], fill=(8, 8, 10)); d.text((x + 8, y + H + 5), cap, font=fc, fill=col)
    y += H + CAP + PAD
canvas.save(out, quality=88); print(out, canvas.size)
