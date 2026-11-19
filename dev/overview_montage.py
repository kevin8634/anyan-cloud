# 10-27 总览拼图：python3 dev/overview_montage.py <目录> <前缀>
#   读 <目录>/<前缀>_*.png 里的六张（营地 / 倒钟广场低角全景 / B3 深水石桥 / 天空仰视 / 选角 A / 选角 B），
#   拼成 3×2 的 总览.png（每格左上角中文标签），再出一份 ≤2400 宽、<1MB 的 总览.jpg
import sys, os
from PIL import Image, ImageDraw, ImageFont

d, pre = sys.argv[1], sys.argv[2]
CELLS = [('1_营地同机位', '营地'), ('w_倒钟广场低角全景', '倒钟广场 · 低角全景'), ('b3w_深水石桥', 'B3 深水石桥'),
         ('s1_天空仰视', '天空仰视'), ('选角_A', '选角 A · 弧形站位'), ('选角_B', '选角 B · 详情面板')]
W, H = 1280, 720
font = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 40)
small = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Regular.otf'), 26)
out = Image.new('RGB', (W * 3, H * 2 + 60), (14, 14, 18))
dr = ImageDraw.Draw(out)
dr.text((20, 10), '暗岩传说 · 比赛版 DLC · 写实模式 + 超高画质 总览（v1.4.8 开发版 10-27）', font=small, fill=(230, 200, 150))
for i, (k, label) in enumerate(CELLS):
    p = os.path.join(d, f'{pre}_{k}.png')
    x, y = (i % 3) * W, 60 + (i // 3) * H
    if not os.path.exists(p):
        dr.text((x + 40, y + 300), f'缺：{k}', font=font, fill=(255, 80, 80)); continue
    im = Image.open(p).convert('RGB')
    s = max(W / im.width, H / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im.width - W) // 2, (im.height - H) // 2
    out.paste(im.crop((l, t, l + W, t + H)), (x, y))
    tw = dr.textlength(label, font=font)
    ov = Image.new('RGBA', (int(tw) + 36, 64), (0, 0, 0, 150)); out.paste(ov, (x + 16, y + 16), ov)
    dr.text((x + 34, y + 20), label, font=font, fill=(255, 225, 170))
    dr.rectangle([x, y, x + W - 1, y + H - 1], outline=(14, 14, 18), width=3)
out.save(os.path.join(d, '总览.png'))
j = out.resize((2400, round(out.height * 2400 / out.width)), Image.LANCZOS)
for q in (88, 82, 76, 70, 64, 58, 50):
    jp = os.path.join(d, '总览.jpg'); j.save(jp, quality=q, optimize=True, progressive=True)
    if os.path.getsize(jp) < 1_000_000: break
print('png', out.size, os.path.getsize(os.path.join(d, '总览.png')), 'jpg', j.size, 'q', q, os.path.getsize(jp))
