# 10-27 遗迹材质前后对比拼图：shots_ruins/改前_N / 改后_N 成对（左改前、右改后），每行一个机位
#   python3 dev/ruinpair.py ../shots_ruins ../shots_ruins/对比_遗迹材质.png
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
D, OUT = sys.argv[1], sys.argv[2]
W, H = 960, 540
FONTS = [os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc']
try: F = ImageFont.truetype(next(f for f in FONTS if os.path.exists(f)), 30)
except Exception:
    fs = glob.glob('/usr/share/fonts/**/*CJK*', recursive=True) + glob.glob('/usr/share/fonts/**/*wqy*', recursive=True)
    F = ImageFont.truetype(fs[0], 30) if fs else ImageFont.load_default()
pairs = []
for a in sorted(glob.glob(os.path.join(D, '改前_*.png'))):
    nm = os.path.basename(a)[3:-4]; b = os.path.join(D, '改后_' + nm + '.png')
    if os.path.exists(b): pairs.append((nm, a, b))
c = Image.new('RGB', (W * 2 + 12, len(pairs) * (H + 8)), (12, 12, 12)); d = ImageDraw.Draw(c)
for i, (nm, a, b) in enumerate(pairs):
    y = i * (H + 8)
    for j, (p, tag) in enumerate(((a, '改前'), (b, '改后'))):
        c.paste(Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS), (j * (W + 12), y))
        t = f'{tag} · {nm}'; d.rectangle([j * (W + 12) + 8, y + 8, j * (W + 12) + 20 + d.textlength(t, font=F), y + 50], fill=(0, 0, 0))
        d.text((j * (W + 12) + 14, y + 10), t, font=F, fill=(255, 210, 140))
c.save(OUT); print(OUT, len(pairs), 'pairs', c.size)
