# raidA A9 实机逐招 GIF + 逐招总览图：python3 dev/a9gif.py <a9shot 输出目录> <GIF / 总览输出目录>
# 每个 <boss>/<key>/f###.jpg → <out>/<中文名>/A9_实机_<boss>_<key>.gif（缩到 640 宽，标首领 · 招式 · 阶段）；
# 每位首领一张总览：每招一行，取 预备中段 / 出手那一帧 / 收招中段 三格（按 a9_log.json 里每帧的动作状态挑）
import json, os, sys, glob
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]
L = json.load(open(os.path.join(src, 'a9_log.json')))
FONT = next((f for f in ['/workspace/work/fonts/NotoSansCJKsc-Regular.otf', os.path.expanduser('~/.fonts/NotoSansSC-Regular.otf'), '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'] if os.path.exists(f)), None)
font = ImageFont.truetype(FONT, 20) if FONT else ImageFont.load_default(); small = ImageFont.truetype(FONT, 15) if FONT else font
ZH = {'gordon': '戈尔顿', 'sarin': '萨琳', 'virg': '维尔格', 'ferry': '摆渡死渡', 'ferry_life': '摆渡生渡', 'morvis': '莫尔维斯'}
KZ = {'melee': '普攻', 'phase': '阶段转换', 'stagger': '打断硬直', 'sweep': '锚链横扫', 'hook': '钩拽·屠宰', 'blood': '血潮', 'hooks': '码头钩手', 'fog': '溺毒雾', 'shriek': '溺魂尖啸', 'mark': '溺毙标记', 'souls': '溺魂',
      'crack': '冰裂', 'oath': '寒誓冰封', 'spike': '冰刺突进', 'bash': '盾击', 'guard': '冰誓扈从', 'oar': '船篙横击', 'death': '死渡', 'life': '生渡', 'ferry': '渡魂', 'mend': '渡生引导',
      'bite': '扑咬', 'surge': '潮涌冲击', 'lure': '诱饵灯', 'drool': '毒涎', 'eels': '寄生鳗', 'flood': '水位上涨'}
def phase(st):
    a = (st or {}).get('act') or ''
    return '预备' if a.endswith(':wind') else '收招' if a.endswith(':rec') else '阶段咆哮' if a == 'roar' else '硬直' if a == 'stagger' else '待机'
for boss, B in L['bosses'].items():
    od = os.path.join(dst, ZH.get(boss, boss)); os.makedirs(od, exist_ok=True); rows = []
    for key, K in B['keys'].items():
        fs = sorted(glob.glob(os.path.join(src, boss, key, 'f*.jpg'))); sts = K['states']
        if not fs: continue
        frames = []
        for i, f in enumerate(fs):
            im = Image.open(f).convert('RGB'); im = im.resize((640, int(im.height * 640 / im.width)))
            can = Image.new('RGB', (im.width, im.height + 30), (16, 20, 24)); can.paste(im, (0, 30)); d = ImageDraw.Draw(can)
            st = sts[i] if i < len(sts) else None; c = (st or {}).get('clip') or {}
            d.text((8, 4), f"{ZH.get(boss, boss)} · {KZ.get(key, key)}（{key}）", font=font, fill=(96, 255, 208))
            d.text((420, 7), f"{phase(st)} {c.get('name', '')} {c.get('t', 0):.2f}s", font=small, fill=(255, 220, 120) if phase(st) == '收招' and i and phase(sts[i - 1]) == '预备' else (200, 210, 220))
            frames.append(can)
        p = os.path.join(od, f'A9_实机_{boss}_{key}.gif'); q = [x.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for x in frames]
        q[0].save(p, save_all=True, append_images=q[1:], duration=[110] * (len(q) - 1) + [700], loop=0, optimize=True)
        ph = [phase(s) for s in sts[:len(fs)]]
        def pick(name, where):
            idx = [i for i, x in enumerate(ph) if x == name]
            return idx[int(len(idx) * where)] if idx else None
        rel = next((i for i in range(1, len(ph)) if ph[i] in ('收招',) and ph[i - 1] == '预备'), None)
        sel = [pick('预备', 0.5) if key not in ('phase', 'stagger') else pick(ph[1] if len(ph) > 1 else '待机', 0.2), rel if rel is not None else len(fs) // 2, pick('收招', 0.6) if key not in ('phase', 'stagger') else pick(ph[1] if len(ph) > 1 else '待机', 0.8)]
        rows.append((key, [frames[i] if i is not None and i < len(frames) else frames[len(frames) // 2] for i in sel]))
        print(p, len(frames))
    if rows:
        w, h = rows[0][1][0].size; sheet = Image.new('RGB', (w * 3, h * len(rows) + 40), (10, 12, 15)); d = ImageDraw.Draw(sheet)
        d.text((10, 8), f"{ZH.get(boss, boss)} · A9 逐招动作 + 技能特效（实机比赛版 {os.environ.get('A9Q', '中画质')} swiftshader）  每行：预备 / 出手 / 收招", font=font, fill=(255, 255, 255))
        for r, (key, ims) in enumerate(rows):
            for c, im in enumerate(ims): sheet.paste(im, (c * w, 40 + r * h))
        sheet = sheet.resize((sheet.width // 2, sheet.height // 2)); out = os.path.join(od, f'A9_{ZH.get(boss, boss)}_逐招总览.jpg'); sheet.save(out, quality=85); print(out)
