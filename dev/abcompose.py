# v1.1.2 截图拼图：python3 dev/abcompose.py [截图目录 /tmp/ab] [输出 png]（先跑 node dev/abshots.mjs <目录> desktop / phone）
import os, sys
from PIL import Image, ImageDraw, ImageFont
SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/ab'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'sample_v112_abyssbody.png'
FD = os.path.expanduser('~/.fonts/')
F = lambda s, b=False: ImageFont.truetype(FD + 'NotoSansSC-%s.otf' % ('Bold' if b else 'Regular'), s)
P = lambda n: Image.open(os.path.join(SRC, n))
def lab(im, t):
    d = ImageDraw.Draw(im); w = d.textlength(t, font=F(20, True)); d.rectangle((0, 0, w + 20, 34), fill=(20, 6, 30)); d.text((10, 3), t, font=F(20, True), fill=(230, 200, 255)); return im
W = 1920
ui = lab(P('desktop_1_ui.png').resize((944, 531)), '电脑 · 变异界面')
hud = lab(P('desktop_4b_devour.png').resize((944, 531)), '电脑 · 渊形态 + 吞噬 HUD')
looks = Image.new('RGB', (1320, 410))
for i, n in enumerate(['2a_front', '2b_back', '3_form']): looks.paste(P(f'desktop_{n}.png').crop((420, 190, 860, 600)), (i * 440, 0))
looks = lab(looks, '电脑 · 渊化角色外观（正面 / 背面 / 渊形态）')
pui = lab(P('phone_1_ui.png').resize((570, 263)), '手机 · 变异界面')
phud = lab(P('phone_4_hud.png').resize((570, 263)), '手机 · 渊形态 HUD')
y = 70 + 531 + 12; H = y + 263 * 2 + 10 + 12
c = Image.new('RGB', (W, H), (12, 4, 18)); d = ImageDraw.Draw(c)
d.text((16, 12), '暗岩传说：深渊回响 · 渊噬之躯（结局 B）', font=F(32, True), fill=(220, 190, 255))
d.rounded_rectangle((W - 170, 14, W - 16, 56), 8, fill=(110, 50, 170)); d.text((W - 150, 14), 'v1.1.2', font=F(28, True), fill=(255, 255, 255))
c.paste(ui, (10, 70)); c.paste(hud, (966, 70)); c.paste(looks, (10, y)); c.paste(pui, (1340, y)); c.paste(phud, (1340, y + 263 + 10))
d.text((20, y + 420), '6 个变异部位：渊冠（角）· 第三只眼 · 结晶臂 · 熔岩之心 · 光脊 · 影触须；渊形态：渊焰罩 + 光环，发光件变亮', font=F(22), fill=(200, 180, 230))
c.save(OUT); print(OUT, c.size)
