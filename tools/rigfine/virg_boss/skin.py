# raidA 11-02 维尔格首领化贴图（0 积分，本地）：python3 skin.py <dir>
# 输入 dir/base0.png mr0.png（绑骨件原 2048 底色 / 金属粗糙度，ext 导出）+ uv.bin（uvdump.mjs）
# 输出 base_virg.png 2048、nrm_virg.png 1024（细节法线）、emi_virg.png 1024、mr_virg.png 1024、pv_virg.jpg（预览）
# 深渊幽魂绿：脸部皮肤去血色偏灰绿 + 冻伤发青 + 发光脉络；誓约徽记 / 眼睛改幽魂绿自发光；甲面霜裂缝渗幽魂绿光；霜面偏青；湿皮 / 湿甲粗糙度下调
import numpy as np, cv2, sys, os
sys.path.insert(0, os.path.dirname(__file__)); from texlib import *; from uvmap import load, bones
D = sys.argv[1].rstrip('/') + '/'; S = 2048; rng = np.random.default_rng(7)
b = cv2.imread(D + 'base0.png').astype(np.float32); mr = cv2.imread(D + 'mr0.png').astype(np.float32)
M = load(D, S); isl = M['isl']; valid = M['bone'] >= 0
H, Sa, V = hsv(b); g = cv2.cvtColor(b.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
metal = mr[..., 0] / 255; rough = mr[..., 1] / 255
y = np.nan_to_num(M['y'], nan=-9); nz = np.nan_to_num(M['nz']); head = bones(M, 'Head', 'HeadTop_End')
# ---- 选区
# 脸：T 字绑定姿势下的几何框（正面投影核对过：脸 + 胡须 |x|<0.09、y 0.66–0.85、朝前）+ 亮度（盔沿暗铁灰不算）
X = np.nan_to_num(M['x'], nan=9); Z = np.nan_to_num(M['z'], nan=-9)
box = lambda x0, y0, y1: (np.abs(X) < x0) & (y > y0) & (y < y1) & (nz > 0.05) & (Z > 0)
fz = box(0.1, 0.6, 0.86).astype(np.float32)
skinlike = np.maximum(np.clip((b[..., 2] - b[..., 0] + 4) / 14, 0, 1), np.clip((V - 0.55) / 0.1, 0, 1) * np.clip((0.2 - Sa) / 0.08, 0, 1))   # 偏暖肤色 / 灰白胡须（盔是冷灰铁）
face = cv2.GaussianBlur(fz * skinlike, (0, 0), 1.5)
# 发光部位：偏蓝高亮（胸前誓约徽记、眼睛）
blue = np.clip((b[..., 0] - b[..., 2] - 18) / 35, 0, 1) * np.clip((V - 0.4) / 0.25, 0, 1)
sigil = cv2.GaussianBlur(blue * box(0.16, 0.3, 0.64), (0, 0), 1.2)
# 眼睛：绑定姿势下双眼位置（正面投影量得 x ±0.042、y 0.833），朝前表面上的小光斑 → 幽魂绿眼火
EX = float(os.environ.get('EYE_X', 0.042)); EY = float(os.environ.get('EYE_Y', 0.833)); ER = float(os.environ.get('EYE_R', 0.011))
ed = np.minimum(np.hypot(X - EX, y - EY), np.hypot(X + EX, y - EY))
eyes = cv2.GaussianBlur(np.clip(1 - ed / ER, 0, 1) ** 1.5 * fz * (nz > 0.3), (0, 0), 0.8)
armor = (1 - face) * valid
cloth = np.zeros_like(face)
frost = np.clip((V - 0.55) / 0.2, 0, 1) * np.clip((0.22 - Sa) / 0.12, 0, 1) * (1 - face)   # 白霜
print('face', round(float(face.mean()), 4), 'sigil', round(float(sigil.mean()), 5), 'eyes', round(float(eyes.mean()), 5), 'armor', round(float(armor.mean()), 3), 'cloth', round(float(cloth.mean()), 3), 'frost', round(float(frost.mean()), 3))
# ---- 底色
o = b.copy()
gray3 = g[..., None] * np.array([0.95, 1.0, 0.86])                  # BGR 灰绿
f3 = face[..., None]
o = o * (1 - 0.45 * f3) + gray3 * 0.45 * f3                            # 皮肤去血色偏灰绿
cold = noise(rng, 14, 6, S); bruise = np.clip(cold * 0.5 + 0.2, 0, 1) * face   # 冻伤青斑
o = o * (1 - 0.18 * bruise[..., None]) + np.array([150, 140, 90]) * 0.18 * bruise[..., None]
o = o * (1 - 0.25 * frost[..., None]) + o * np.array([1.06, 1.04, 0.9]) * 0.25 * frost[..., None]   # 霜偏青
a3 = armor[..., None]; o = o * (1 - 0.2 * a3) + (o * 0.82 * np.array([1.0, 1.03, 0.94])) * 0.2 * a3   # 甲面压暗、去暖
c3 = cloth[..., None]; o = o * (1 - 0.3 * c3) + (g[..., None] * np.array([0.8, 0.85, 0.65]) * 0.75) * 0.3 * c3   # 内衬发黑偏墨绿
# ---- 自发光
vn = veins(rng, S, width=0.05) * face * np.clip(noise(rng, 8, 5, S) * 0.8 + 0.3, 0, 1)
crev = np.clip((crevice(g, isl, r=4, k=14, off=5) - 0.35) / 0.4, 0, 1) * armor * np.clip(noise(rng, 10, 6, S) * 1.5 - 0.9, 0, 1)   # 甲面霜裂缝：只取深缝、只亮约三成区域（不成一层雾）
crev = cv2.GaussianBlur(crev, (0, 0), 0.7)
em = np.clip(sigil * 1.6, 0, 1); emE = np.clip(eyes * 2.0, 0, 1)
E = GHOST2 * np.clip(em + emE, 0, 1)[..., None] + GHOST * np.clip(vn * 0.45 + crev * 0.9, 0, 1)[..., None]
glow = np.clip(em + emE + vn * 0.3 + crev * 0.35, 0, 1)[..., None]
o = o * (1 - 0.5 * glow) + GHOST2 * 0.5 * glow                          # 发光处底色同色（不发光时也看得出）
# ---- 金属粗糙度：湿皮 / 湿甲
r2 = np.clip(rough * (1 - 0.3 * face) * (1 - 0.2 * armor) - 0.1 * frost * 0, 0.12, 1); m2 = np.clip(0.45 + 0.4 * metal, 0, 0.9) * armor * (1 - 0.6 * frost)   # Lux3D 金属图零碎不可靠：甲面统一 0.45–0.85
mrO = np.dstack([m2 * 255, r2 * 255, np.zeros_like(r2)])   # BGR：B=金属 G=粗糙
# ---- 法线：原始 29.7 万面件烘的 2048 法线（gordon_nrmbake）+ 亮度高通细节（甲面划痕 / 霜花 / 脸部皱纹），出 1024
h = (cv2.GaussianBlur(g, (0, 0), 1.2) - blur_in(g, isl, 8)) / 40 * (1 - 0.7 * face) + 0.04 * noise(rng, 512, 0.8, S) * armor   # 脸部细节压到 0.3（没有 CodeFormer 环境时不放大毛孔噪点）
dn = detail_normal(h.astype(np.float32), isl, 0.5, S).astype(np.float32) / 127.5 - 1   # RGB
nb = cv2.imread(D + 'disp_nrm_normal.png')[:, :, ::-1].astype(np.float32) / 127.5 - 1
n2 = np.dstack([nb[..., 0] + dn[..., 0], nb[..., 1] + dn[..., 1], nb[..., 2]]); n2 /= np.linalg.norm(n2, axis=2, keepdims=True); del nb, dn
nrm = cv2.resize(((n2 * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA); del n2
core = cv2.erode(isl.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0   # 岛边 2 px 是 Lux3D 烘的暗边，去掉后从岛内外扩
o = bleed(np.where(core[..., None], o, 0), core, 10); E = bleed(np.where(core[..., None], E, 0), core, 10)
cv2.imwrite(D + 'base_virg.png', o.clip(0, 255).astype(np.uint8))
cv2.imwrite(D + 'emi_virg.png', cv2.resize(E.clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA))
cv2.imwrite(D + 'mr_virg.png', cv2.resize(bleed(np.where(core[..., None], mrO, 0), core, 10).clip(0, 255).astype(np.uint8), (1024, 1024), interpolation=cv2.INTER_AREA))
cv2.imwrite(D + 'nrm_virg.png', nrm[:, :, ::-1])
dbg = np.dstack([face * 255, sigil * 255 + eyes * 255, armor * 120 + cloth * 60])
cv2.imwrite(D + 'pv_virg.jpg', cv2.resize(np.hstack([b, o, E * 1.0, dbg]), (2048, 512)).clip(0, 255).astype(np.uint8))
print('ok emi mean', round(float(E.mean()), 3))
