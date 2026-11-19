"""Opening v1: 3 painted stills + motion -> frames 0..T_LOGO, then M1 anim a. 1280x720 24fps."""
import os, math, random, subprocess
import numpy as np
from PIL import Image, ImageFilter
W, H, FPS = 1280, 720, 24
D = '/workspace/work/opening'; FR = D + '/fr'; os.makedirs(FR, exist_ok=True)
ANIM = '/workspace/work/trailer/logo_anim/M1_logo_anim_a.mp4'
SH = [('o1_bell', 0.0, 3.5), ('o2_abyss', 3.5, 7.0), ('o3_king', 7.0, 10.5)]
T_BLACK, T_STILL0, T_STILL1 = 10.5, 10.7, 11.5   # black, logo still fade-in, then anim
rng = np.random.default_rng(7)

def load(k):
    im = Image.open(f'{D}/{k}.png').convert('RGB')
    return np.asarray(im).astype(np.float32) / 255.0
IMG = {k: load(k) for k, _, _ in SH}
# crack glow mask for bell (teal pixels)
b = IMG['o1_bell']; m = np.clip((b[..., 1] - np.maximum(b[..., 0], b[..., 2] * 0.9)) * 6, 0, 1)
CRACK = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255

def ss(a, b, x):
    t = min(max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t)

def view(arr, cx, cy, scale):
    """crop 16:9 window centered (cx,cy) in source px, width 1536/scale, resize to W,H"""
    sh, sw = arr.shape[:2]; cw = 1536 / scale; ch = cw * 9 / 16
    x0 = min(max(cx - cw / 2, 0), sw - cw); y0 = min(max(cy - ch / 2, 0), sh - ch)
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    return np.asarray(im.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + cw, y0 + ch))).astype(np.float32) / 255, (x0, y0, cw / W)

# rain layer (tileable streaks)
rain = Image.new('L', (W, H * 2)); from PIL import ImageDraw
dr = ImageDraw.Draw(rain)
for _ in range(900):
    x, y = rng.uniform(0, W), rng.uniform(0, H * 2); L = rng.uniform(18, 46)
    dr.line([(x, y), (x - L * 0.18, y + L)], fill=int(rng.uniform(40, 110)), width=1)
RAIN = np.asarray(rain).astype(np.float32) / 255
# embers
NE = 70
E = dict(x=rng.uniform(0, W, NE), y=rng.uniform(0, H, NE), vy=rng.uniform(20, 60, NE), ph=rng.uniform(0, 6.28, NE), s=rng.uniform(1, 2.6, NE))
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)

def embers(fr, t, amt):
    if amt <= 0: return fr
    x = (E['x'] + 18 * np.sin(t * 1.3 + E['ph'])) % W; y = (E['y'] - E['vy'] * t) % H
    a = amt * (0.55 + 0.45 * np.sin(t * 7 + E['ph'] * 3))
    for i in range(NE):
        xi, yi, r = int(x[i]), int(y[i]), E['s'][i]
        x0, x1, y0, y1 = max(xi - 6, 0), min(xi + 7, W), max(yi - 6, 0), min(yi + 7, H)
        g = np.exp(-((XX[y0:y1, x0:x1] - x[i]) ** 2 + (YY[y0:y1, x0:x1] - y[i]) ** 2) / (2 * r * r)) * a[i]
        fr[y0:y1, x0:x1] += g[..., None] * np.array([1.0, 0.55, 0.18])
    return fr

def shot1(t):
    u = t / 3.5
    fr, (x0, y0, k) = view(IMG['o1_bell'], 768, 560 - 120 * ss(0, 1, u), 1.0 + 0.12 * ss(0, 1, u))
    cm, _ = view(CRACK[..., None].repeat(3, 2), 768, 560 - 120 * ss(0, 1, u), 1.0 + 0.12 * ss(0, 1, u))
    pulse = 0.2 + 0.45 * ss(0.6, 1.4, t) * (0.7 + 0.3 * math.sin(t * 9))
    fr += cm * np.array([0.1, 0.9, 0.7]) * pulse
    fl = 0.9 * math.exp(-max(t - 0.95, 0) / 0.09) * (t >= 0.95) + 0.5 * math.exp(-max(t - 1.25, 0) / 0.07) * (t >= 1.25)
    fr = fr * (1 + fl) + fl * 0.08
    off = int((t * 1400) % H)
    fr += (RAIN[off:off + H] * 0.55)[..., None] * np.array([0.75, 0.8, 0.85])
    return embers(fr, t, 0.3)

def shot2(t):
    u = (t - 3.5) / 3.5; cx, cy = 790, 600
    fr, (x0, y0, k) = view(IMG['o2_abyss'], 768 + (cx - 768) * ss(0, 1, u), 512 + (cy - 512) * ss(0, 1, u), 1.0 + 0.38 * ss(0, 1, u) ** 1.2)
    px, py = (cx - x0) / k, (cy - y0) / k
    rr = np.sqrt(((XX - px) / 1.0) ** 2 + ((YY - py) / 0.62) ** 2) * k
    ring = np.zeros_like(rr)
    for j in range(5):
        R = ((t - 3.5) * 150 + j * 120) % 600
        ring += np.exp(-((rr - R) ** 2) / (2 * 9 ** 2)) * (1 - R / 600) ** 1.5
    fr += ring[..., None] * np.array([0.08, 0.75, 0.55]) * 0.55
    return embers(fr, t, 0.45)

EYES = [(725, 250), (800, 250)]
def shot3(t):
    u = (t - 7.0) / 3.5
    sc = 1.0 + 0.16 * ss(0, 1, u)
    shake = 6 * math.exp(-max(t - 9.75, 0) / 0.12) * math.sin(t * 90) if t >= 9.75 else 0
    fr, (x0, y0, k) = view(IMG['o3_king'], 768, 512 - 150 * ss(0, 1, u) + shake, sc)
    e = ss(7.8, 9.75, t) ** 2.2 + 0.35 * math.exp(-max(t - 9.75, 0) / 0.25) * (t >= 9.75)
    e *= 1 + 0.06 * math.sin(t * 23)
    for ex, ey in EYES:
        px, py = (ex - x0) / k, (ey - y0) / k
        d2 = (XX - px) ** 2 + ((YY - py) * 1.6) ** 2
        core = np.exp(-d2 / (2 * (3.2 / k) ** 2)); halo = np.exp(-d2 / (2 * (16 / k) ** 2)); far = np.exp(-d2 / (2 * (60 / k) ** 2))
        fr += (core[..., None] * np.array([1.4, 1.2, 0.8]) + halo[..., None] * np.array([1.0, 0.35, 0.08]) * 0.9 + far[..., None] * np.array([0.6, 0.12, 0.03]) * 0.35) * e
    fr *= 1 - 0.25 * ss(0, 0.4, u) * (1 - e)  # darken surround as eyes ignite
    return embers(fr, t, 0.35 + 0.4 * e)

still = '/workspace/work/opening/logo_still.png'
if not os.path.exists(still):
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', ANIM, '-frames:v', '1', still], check=True)
STILL = np.asarray(Image.open(still).convert('RGB').resize((W, H))).astype(np.float32) / 255

N = int(round(T_STILL1 * FPS))
for i in range(N):
    t = i / FPS
    if t < 3.5: fr = shot1(t); a, b_ = 0.0, 3.5
    elif t < 7.0: fr = shot2(t); a, b_ = 3.5, 7.0
    elif t < T_BLACK: fr = shot3(t); a, b_ = 7.0, T_BLACK
    else:
        fr = STILL * ss(T_STILL0, T_STILL1, t); a, b_ = None, None
    if a is not None:
        fin = ss(a, a + 0.35, t) if a > 0 else ss(0, 0.5, t)
        fout = 1 - ss(b_ - 0.3, b_, t)
        fr = fr * fin * fout
    v = np.clip(fr, 0, 1); v = v / (1 + 0.15 * v) * 1.15  # soft shoulder
    Image.fromarray((np.clip(v, 0, 1) * 255).astype(np.uint8)).save(f'{FR}/{i:04d}.png')
print('frames', N)
