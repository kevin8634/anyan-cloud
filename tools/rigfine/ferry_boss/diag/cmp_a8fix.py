# A8fix 近景前后对照：python3 cmp_a8fix.py <beforeDir> <afterDir> <outDir>   （各含 death/ life/ 的 shoot.mjs STILLS 机位图）
import sys, os, numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
B, A, O = sys.argv[1:4]; f = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 22); fs = ImageFont.truetype(os.path.expanduser('~/.fonts/NotoSansSC-Bold.otf'), 18)
NM = {'death': '死渡', 'life': '生渡'}
cams = [('waist', '腰部 正', None), ('waist_s', '腰部 侧', None), ('waist_b', '腰部 背', None), ('hood', '兜帽 正', None), ('hood_l', '兜帽 左前', None), ('hood_r', '兜帽 右前', None), ('hood', '额角 放大', (150, 60, 500, 300)), ('face', '脸部近景', None)]
T = 320
for m in ['death', 'life']:
    rows = []
    for d in [B, A]:
        r = []
        for c, _, cr in cams:
            im = Image.open(f'{d}/{m}/{c}.png').convert('RGB')
            if cr: im = im.crop(cr)
            r.append(np.array(im.resize((T, T if not cr else int(T * (cr[3] - cr[1]) / (cr[2] - cr[0]))))))
        r = [np.pad(x, ((0, T - x.shape[0]), (0, 0), (0, 0)), constant_values=28) for x in r]
        rows.append(np.hstack(r))
    im = np.vstack(rows); H = 40; cv = np.full((im.shape[0] + H + 70, im.shape[1] + 130, 3), 28, np.uint8); cv[H + 70:, 130:] = im
    pil = Image.fromarray(cv); dr = ImageDraw.Draw(pil)
    dr.text((10, 8), f'暗岩传说 raidA 摆渡双子·{NM[m]} A8fix（11-03，0 积分）：①下摆上沿压住皮带锯齿、外套收得更深 ②生渡右胯外套不戳出 ③额角尖三角补皮肤色 + 法线接脸、兜帽内沿平滑', font=fs, fill=(230, 230, 230))
    for i, (_, n, _) in enumerate(cams): dr.text((130 + i * T + 8, H + 30), n, font=f, fill=(200, 220, 255))
    for j, t in enumerate(['修前 v2', 'A8fix']): dr.text((10, H + 70 + j * T + T // 2 - 12), t, font=f, fill=(255, 220, 150))
    pil.save(f'{O}/暗岩传说_raidA_摆渡双子_{NM[m]}_对照_A8fix.jpg', quality=88)
