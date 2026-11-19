# v1.2.49 选角重做：概念图 vs 实装 对比拼图
#   python3 dev/selectcompare.py <概念目录> <截图目录> <输出.png>
import sys
from PIL import Image, ImageDraw, ImageFont
C, S, OUT = sys.argv[1:4]
W, H = 800, 450
F = ImageFont.truetype('/home/sandbox/.fonts/NotoSansSC-Bold.otf', 22)
cols = [('概念图', f'{C}/select_A_arc.png', f'{C}/select_B_detail.png'),
        ('实装 · DLC（倒钟广场低角全景）', f'{S}/DLC_A.png', f'{S}/DLC_B.png'),
        ('实装 · DLC 比赛版', f'{S}/DLC比赛版_A.png', f'{S}/DLC比赛版_B.png'),
        ('实装 · 本体（营地）', f'{S}/本体_A.png', f'{S}/本体_B.png'),
        ('实装 · 本体比赛版（营地）', f'{S}/比赛版_A.png', f'{S}/比赛版_B.png')]
import os
cols = [c for c in cols if os.path.exists(c[1]) and os.path.exists(c[2])]
pad, top = 10, 40
img = Image.new('RGB', (len(cols) * (W + pad) + pad, 2 * (H + top) + pad), (12, 16, 18))
d = ImageDraw.Draw(img)
for i, (name, a, b) in enumerate(cols):
    x = pad + i * (W + pad)
    for j, (p, tag) in enumerate(((a, 'A 默认'), (b, 'B 选中'))):
        y = j * (H + top)
        d.text((x + 4, y + 8), f'{name} · {tag}', font=F, fill=(255, 180, 90))
        im = Image.open(p).convert('RGB'); im = im.resize((W, int(im.height * W / im.width)))
        img.paste(im.crop((0, 0, W, min(H, im.height))), (x, y + top))
img.save(OUT); print(OUT, img.size)
