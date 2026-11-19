# raidA 11-03 脸部近景前后对照（萨琳共用）：python3 facecmp.py <face_old 目录> <face_new 目录> <标题> <输出.jpg>
# 两行（改前 / 改后）× 三机位（正面近景 facef、左前 3/4 facel、右前 face），WebGL 实渲（shoot.mjs CAMS=facef,facel,face）
import sys, os
from PIL import Image, ImageDraw, ImageFont
o, n, title, out = sys.argv[1:5]
F = '/workspace/work/fonts/NotoSansCJKsc-Regular.otf'; FB = '/workspace/work/fonts/NotoSansCJKsc-Bold.otf'
ft = ImageFont.truetype(FB, 30); fl = ImageFont.truetype(F, 22)
cams = [('facef', '正面近景'), ('facel', '左前 3/4'), ('face', '右前近景')]; S = 560
# 11-03 萨琳：灯杖挡左前 3/4、默认机位偏低 → 自定机位（shoot.mjs CAMS=0:0:0.14:1.0,-15:0.02:0.2:0.99,35:0.01:0.16:1.0，改名 facef/facel/facer）
if os.environ.get('FCAMS'): cams = [tuple(x.split('=')) for x in os.environ['FCAMS'].split(',')]
pad = 12; lw = 150
im = Image.new('RGB', (lw + 3 * (S + pad) + pad, 70 + 2 * (S + pad) + 50), (18, 20, 24)); d = ImageDraw.Draw(im)
d.text((pad, 18), title, font=ft, fill=(235, 235, 235))
for r, (dr, lab) in enumerate([(o, '改前\n（原贴图\n 糊 / 偏粉）'), (n, '改后\n（2048 独立脸\n 幽魂眼火）')]):
    y = 70 + r * (S + pad); d.multiline_text((pad, y + S // 2 - 40), lab, font=fl, fill=(200, 230, 220), spacing=6)
    for c, (k, cl) in enumerate(cams):
        x = lw + pad + c * (S + pad); im.paste(Image.open(os.path.join(dr, k + '.png')).convert('RGB').resize((S, S), Image.LANCZOS), (x, y))
        if r == 0: d.text((x + 8, y + 6), cl, font=fl, fill=(255, 255, 255))
d.text((pad, im.height - 38), '0 积分：正面投影 → CodeFormer w0.8 → 亡灵肤色（灰绿、去血色）→ Real-ESRGAN x4 → 2048 底色 + 细节法线 K=0.6；眼睛重绘幽魂绿眼火 0x50f0e0 / 0x60ffd0（自发光），无人眼', font=fl, fill=(170, 175, 180))
im.save(out, quality=90); print(out, im.size)
