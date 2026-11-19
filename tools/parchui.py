# 界面羊皮纸皮肤：从 GPT Image 2 素材（concepts/parchment/，11-16 生成，Rhett 已批）切图压缩，
# 写出 src/web/parchui.gen.ts（data URL，和 vfxtex.gen.ts 同法，不放冻结的 assets/）。
#   python3 tools/parchui.py [素材目录=../concepts/parchment] [中间文件目录=/tmp/parchui]
# 依赖：Pillow（webp）、numpy、scipy
import sys, os, io, base64, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', '..', 'concepts', 'parchment')
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/parchui'
os.makedirs(OUT, exist_ok=True)
BG = np.array([24, 20, 17])          # widgets.png 底色

def load(n): return Image.open(os.path.join(SRC, n)).convert('RGB')

def cut_alpha(im, tol=22):
    """从裁切框四边泛洪：与底色相近且连到边上的像素透明，其余不透明；边缘 1px 羽化"""
    a = np.asarray(im).astype(int)
    near = np.abs(a - BG).max(axis=2) <= tol
    lab, _ = ndimage.label(near)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(edge))
    al = (~bgm).astype(np.uint8) * 255
    al = np.asarray(Image.fromarray(al).filter(ImageFilter.GaussianBlur(0.7)))
    out = im.convert('RGBA'); out.putalpha(Image.fromarray(al))
    return out

def trim(im, box, tol=22):
    """在 box 里按非底色像素收紧边界"""
    c = im.crop(box); a = np.asarray(c).astype(int)
    m = np.abs(a - BG).max(axis=2) > tol
    ys, xs = np.where(m)
    return c.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

files = {}
def save(name, im, q=80, lossless=False):
    b = io.BytesIO()
    im.save(b, 'WEBP', quality=q, method=6, lossless=lossless)
    files[name] = b.getvalue()
    open(os.path.join(OUT, name + '.webp'), 'wb').write(b.getvalue())
    return im

# ---------- 1. 羊皮纸底纹：512 平铺，略提亮、压对比，保证墨字可读 ----------
t = load('tile.png').resize((512, 512), Image.LANCZOS)
ta = np.asarray(t).astype(float)
cream = np.array([244, 232, 204.0])
ta = ta * 0.72 + cream * 0.28                       # 向奶油色拉 28%（墨字对比度留余量）
mean = ta.reshape(-1, 3).mean(0); ta = mean + (ta - mean) * 0.8   # 纹理对比 ×0.8
save('tile', Image.fromarray(np.clip(ta, 0, 255).astype(np.uint8)), q=80)

# ---------- 2. 窗口青铜边框：九宫格（中心透明）+ 角上菱形宝石 ----------
fr = load('frame.png'); W, H = fr.size
R = 17                                              # 边条宽（原图 x≈21..38 青铜条；外侧黑底与内侧破纸不要，内阴影交给 CSS）
x0 = 21
left = fr.crop((x0, 352, x0 + R, 352 + 128))        # 左边条（竖向 128）
right = fr.crop((W - x0 - R, 296, W - x0, 296 + 128))
bot = fr.crop((242, H - 22 - R, 242 + 128, H - 22))  # 下边条（原图距底 22..46）
top = bot.transpose(Image.FLIP_TOP_BOTTOM)          # 上边条用下边条翻转（原图上边是标题条）
N = 128
rail = Image.new('RGBA', (N, N), (0, 0, 0, 0))
def strip_alpha(im, axis):
    """边条朝内侧淡出：内侧 2px 抗锯齿淡出"""
    im = im.convert('RGBA'); a = np.asarray(im).copy()
    n = a.shape[1] if axis == 'x' else a.shape[0]
    ramp = np.clip((n - np.arange(n)) / 2.0, 0, 1)  # 内侧 2px 抗锯齿
    ramp = np.minimum(ramp, 1.0)
    if axis == 'x': a[:, :, 3] = (ramp[None, :] * 255).astype(np.uint8)
    else: a[:, :, 3] = (ramp[:, None] * 255).astype(np.uint8)
    return Image.fromarray(a)
L = strip_alpha(left, 'x')
Rr = strip_alpha(right.transpose(Image.FLIP_LEFT_RIGHT), 'x').transpose(Image.FLIP_LEFT_RIGHT)
B = strip_alpha(bot.transpose(Image.FLIP_TOP_BOTTOM), 'y').transpose(Image.FLIP_TOP_BOTTOM)
T = strip_alpha(top, 'y')
rail.alpha_composite(L, (0, 0)); rail.alpha_composite(Rr, (N - R, 0))
rail.alpha_composite(T, (0, 0)); rail.alpha_composite(B, (0, N - R))
save('rail', rail, q=82)

# 菱形宝石（左上角那颗），菱形遮罩抠出
cx, cy, rr = 57, 57, 47
g = fr.crop((cx - rr, cy - rr, cx + rr, cy + rr)).convert('RGBA')
m = Image.new('L', (rr * 2 * 4, rr * 2 * 4), 0)
c4, r4 = rr * 4, (rr - 1) * 4
ImageDraw.Draw(m).polygon([(c4, c4 - r4), (c4 + r4, c4), (c4, c4 + r4), (c4 - r4, c4)], fill=255)
m = m.resize((rr * 2, rr * 2), Image.LANCZOS)
g.putalpha(m)
save('gem', g.resize((64, 64), Image.LANCZOS), q=85)

# 标题条：深皮革（原图顶部标题条中段）
tb = fr.crop((300, 40, 300 + 400, 40 + 52))
save('title', tb.resize((400, 52), Image.LANCZOS), q=72)

# ---------- 3. 控件 ----------
wd = load('widgets.png')
def widget(name, box, size, q=82):
    c = cut_alpha(trim(wd, box))
    if size: c = c.resize(size, Image.LANCZOS)
    save(name, c, q=q); return c
btn_box = [(30, 90, 585, 300), (30, 335, 585, 555), (30, 585, 585, 810)]
for nm, bx in zip(['btn_n', 'btn_h', 'btn_p'], btn_box):
    c = trim(wd, bx); w, h = c.size
    widget(nm, bx, (240, round(240 * h / w)), q=86)
widget('chk0', (680, 285, 820, 425), (48, 48), q=85)
widget('chk1', (890, 285, 1032, 425), (48, 48), q=85)
widget('slot', (655, 475, 1055, 875), (128, 128), q=78)
c = trim(wd, (1110, 100, 1525, 160)); w, h = c.size
widget('div', (1110, 100, 1525, 160), (320, round(320 * h / w)), q=85)
widget('close', (1130, 475, 1345, 675), (64, 60), q=85)
# 滚动条：轨道取中段（不含上下箭头），滑块单独
sb = trim(wd, (1410, 200, 1510, 890)); sw, sh = sb.size
track = cut_alpha(sb.crop((0, 100, sw, sh - 100)))
save('sb_track', track.resize((16, 128), Image.LANCZOS), q=80)
thumb = cut_alpha(wd.crop((1430, 448, 1490, 572)))
save('sb_thumb', thumb.resize((16, 34), Image.LANCZOS), q=85)

# ---------- 4. 写 TS ----------
total = sum(len(v) for v in files.values())
lines = ['// 自动生成：python3 tools/parchui.py —— 界面羊皮纸皮肤（11-16 GPT Image 2 素材 concepts/parchment/，Rhett 批准）',
         f'// {len(files)} 张 webp，共 {total / 1024:.0f} KB；icons.ts installArt() 写成 CSS 变量 --pu-<名>，样式见 index.html「羊皮纸窗口」段',
         'export const PARCH_UI: Record<string, string> = {']
for k, v in files.items():
    lines.append(f'  {k}: "data:image/webp;base64,{base64.b64encode(v).decode()}",')
lines.append('};')
dst = os.path.join(os.path.dirname(__file__), '..', 'src', 'web', 'parchui.gen.ts')
open(dst, 'w').write('\n'.join(lines) + '\n')
print(json.dumps({k: len(v) for k, v in files.items()}), 'total', total, 'B')
