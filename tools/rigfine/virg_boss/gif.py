# raidA 11-02 维尔格 / 萨琳技能 GIF（萨琳共用）：python3 gif.py <shoot 输出目录> <角色中文名> <GIF 输出目录> [前缀]
# 每个 frames_<clip>/f###_<机位>.png 横拼（右前 3/4 + 右侧），顶部写「角色 · 技能中文名（id）」与时间 / 出手标记，帧率按出帧数 / 时长推算
import json, glob, os, sys
from PIL import Image, ImageDraw, ImageFont
src, who, dst = sys.argv[1], sys.argv[2], sys.argv[3]; pre = sys.argv[4] if len(sys.argv) > 4 else ''
os.makedirs(dst, exist_ok=True); clips = {c['name']: c for c in json.load(open(os.path.join(src, 'clips.json')))}
FONT = next((f for f in [os.environ.get('CJK_FONT', ''), '/workspace/work/fonts/NotoSansCJKsc-Regular.otf', os.path.expanduser('~/.fonts/NotoSansSC-Regular.otf'), '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'] if f and os.path.exists(f)), None)
font = ImageFont.truetype(FONT, 20) if FONT else ImageFont.load_default(); small = ImageFont.truetype(FONT, 14) if FONT else font
META = json.load(open(os.path.join(src, 'meta.json'))) if os.path.exists(os.path.join(src, 'meta.json')) else {}  # 11-03：glb 不带 extras 时从 clips.mjs 导出的 meta.json 取中文名 / 出手时刻
out = []
for d in sorted(glob.glob(os.path.join(src, 'frames_*'))):
    cid = d.split('frames_')[1]; c = clips.get(cid, {}); ex = c.get('extras') or META.get(cid, {}); zh = ex.get('zh', cid); hit = ex.get('hit')
    fs = sorted(glob.glob(os.path.join(d, 'f*_0.png'))); frames = []
    FPS = round((len(fs) - 1) / c['dur']) if c.get('dur') and len(fs) > 1 else 12  # 11-03：按实际出帧率（shots.sh 用 FPS=10）
    for i, f0 in enumerate(fs):
        ims = [Image.open(f) for f in sorted(glob.glob(f0[:-6] + '_*.png'))]; W = sum(i.width for i in ims); Hh = ims[0].height
        can = Image.new('RGB', (W, Hh + 34), (18, 22, 27)); x = 0
        for im in ims: can.paste(im.convert('RGB'), (x, 34)); x += im.width
        dr = ImageDraw.Draw(can); t = i / FPS
        dr.text((10, 5), f'{who} · {zh}（{cid}）', font=font, fill=(96, 255, 208))
        tag = f't={t:.2f}s / {c.get("dur", 0):.2f}s' + ('   ◆出手' if hit is not None and abs(t - hit) < 0.5 / FPS + 1e-6 else '')
        dr.text((W - 230, 9), tag, font=small, fill=(255, 220, 120) if '出手' in tag else (200, 210, 220))
        frames.append(can.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    if not frames: continue
    p = os.path.join(dst, f'{pre}{cid}.gif'); dur = [int(1000 / FPS)] * len(frames); dur[-1] = 600
    frames[0].save(p, save_all=True, append_images=frames[1:], duration=dur, loop=0, optimize=True); out.append((p, os.path.getsize(p) // 1024))
for p, k in out: print(p, k, 'KB')
