# raidA 11-02 萨琳首领化贴图（0 积分，本地）：python3 skin.py <dir>（公用函数在 ../virg_boss/texlib.py、uvmap.py）
# 输入 dir/base0.png mr0.png disp_nrm_normal.png（原始 29.7 万面件烘的 2048 法线）uv.bin
# 输出 base_sarin.png 2048、nrm_sarin.png 1024、emi_sarin.png 1024、mr_sarin.png 1024、pv_sarin.jpg
# 深渊幽魂绿：皮肤苍青 → 灰绿 + 溺水斑加深 + 皮下幽魂绿脉络；眼睛幽魂绿眼火；湿袍：粗糙度大降、去金属（Lux3D 金属图把布料标成半金属）、布缝 / 下摆渗光；发间海草偏墨绿
import numpy as np, cv2, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../virg_boss')); from texlib import *; from uvmap import load, bones
D = sys.argv[1].rstrip('/') + '/'; S = 2048; rng = np.random.default_rng(11)
b = cv2.imread(D + 'base0.png').astype(np.float32); mr = cv2.imread(D + 'mr0.png').astype(np.float32)
M = load(D, S); isl = M['isl']; valid = (M['bone'] >= 0).astype(np.float32)
X = np.nan_to_num(M['x'], nan=9); y = np.nan_to_num(M['y'], nan=-9); Z = np.nan_to_num(M['z'], nan=-9); nz = np.nan_to_num(M['nz']); del M
H, Sa, V = hsv(b); g = cv2.cvtColor(b.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
rough = mr[..., 1] / 255; del mr
# ---- 选区：苍青皮肤（偏蓝、较亮、不太饱和）
skin = np.clip((b[..., 0] - b[..., 2] - 8) / 20, 0, 1) * np.clip((V - 0.32) / 0.12, 0, 1) * np.clip((0.55 - Sa) / 0.15, 0, 1) * ((H > 170) & (H < 250))
skin = cv2.GaussianBlur(skin.astype(np.float32), (0, 0), 1.5) * valid
hair = np.clip((0.16 - V) / 0.08, 0, 1) * (y > 0.62) * valid                 # 头上的黑发
cloth = np.clip(1 - skin - hair, 0, 1) * valid
EX, EY, ER = 0.0425, 0.858, 0.015
ed = np.minimum(np.hypot(X - EX, y - EY), np.hypot(X + EX, y - EY))
eyes = cv2.GaussianBlur(np.clip(1 - ed / ER, 0, 1) ** 1.2 * (nz > 0.3) * (Z > 0) * (np.abs(X) < 0.08), (0, 0), 0.8)
print('skin', round(float(skin.mean()), 3), 'hair', round(float(hair.mean()), 3), 'cloth', round(float(cloth.mean()), 3), 'eyes', round(float(eyes.mean()), 5))
# ---- 底色
o = b.copy(); s3 = skin[..., None]
o = o * (1 - 0.6 * s3) + (g[..., None] * np.array([0.93, 1.0, 0.8])) * 0.6 * s3               # 苍青 → 灰绿死肤
blot = np.clip(noise(rng, 18, 5, S) * 0.6 - 0.2, 0, 1) * skin                               # 溺水斑（青紫）
o = o * (1 - 0.3 * blot[..., None]) + np.array([95, 80, 70]) * 0.3 * blot[..., None]
c3 = cloth[..., None]; o = o * (1 - 0.25 * c3) + (o * np.array([0.92, 1.02, 0.85])) * 0.25 * c3   # 袍子偏墨绿
# ---- 自发光
vn = veins(rng, S, scales=((30, 1.0), (70, 0.55)), width=0.055) * skin * np.clip(noise(rng, 9, 5, S) * 0.9 + 0.35, 0, 1)
crev = np.clip((crevice(g, isl, r=4, k=12, off=4) - 0.3) / 0.4, 0, 1) * cloth * np.clip(noise(rng, 10, 6, S) * 1.5 - 0.8, 0, 1)
crev = cv2.GaussianBlur(crev, (0, 0), 0.7)
low = np.clip((0.0 - y) / 0.25, 0, 1) * cloth * np.clip(noise(rng, 16, 4, S) * 0.8 + 0.2, 0, 1) * 0.08   # 腿脚处袍布浸水微光（多数被下摆盖住）
E = GHOST2 * np.clip(eyes * 2.2, 0, 1)[..., None] + GHOST * np.clip(vn * 0.9 + crev * 0.7 + low, 0, 1)[..., None]
glow = np.clip(eyes * 2 + vn * 0.35 + crev * 0.3, 0, 1)[..., None]
o = o * (1 - 0.5 * glow) + GHOST2 * 0.5 * glow
# ---- 金属粗糙度：湿皮 / 湿袍，去金属
r2 = np.clip(rough * (1 - 0.35 * skin) * (1 - 0.45 * cloth) * (1 - 0.3 * hair), 0.14, 1)
m2 = 0.06 * cloth
mrO = np.dstack([m2 * 255, r2 * 255, np.zeros_like(r2)]).astype(np.float32)
# ---- 法线：烘焙 + 细节（布纹 / 皮肤褶）
h = (cv2.GaussianBlur(g, (0, 0), 1.2) - blur_in(g, isl, 8)) / 45 * (1 - 0.6 * skin) + 0.03 * noise(rng, 600, 0.8, S) * cloth   # 湿面低粗糙度会放大高频，细节压低
dn = detail_normal(h.astype(np.float32), isl, 0.45, S).astype(np.float32) / 127.5 - 1
nb = cv2.imread(D + 'disp_nrm_normal.png')[:, :, ::-1].astype(np.float32) / 127.5 - 1
n2 = np.dstack([nb[..., 0] + dn[..., 0], nb[..., 1] + dn[..., 1], nb[..., 2]]); n2 /= np.linalg.norm(n2, axis=2, keepdims=True); del nb, dn
nrm = cv2.resize(((n2 * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA); del n2
core = cv2.erode(isl.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
o = bleed(np.where(core[..., None], o, 0), core); E = bleed(np.where(core[..., None], E, 0), core); mrO = bleed(np.where(core[..., None], mrO, 0), core)
cv2.imwrite(D + 'base_sarin.png', o.clip(0, 255).astype(np.uint8))
cv2.imwrite(D + 'emi_sarin.png', cv2.resize(E.clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA))
cv2.imwrite(D + 'mr_sarin.png', cv2.resize(mrO.clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA))
cv2.imwrite(D + 'nrm_sarin.png', nrm[:, :, ::-1])
print('ok emi mean', round(float(E.mean()), 3))
