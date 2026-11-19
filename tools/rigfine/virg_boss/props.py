# raidA 11-02 维尔格附加件贴图（0 积分，程序化）：python3 props.py <dir>
# 寒誓巨剑：剑身 512×1024（u 横跨刃宽，v 剑根 → 剑尖）底色 / 法线 / 自发光（血槽里一串幽魂绿誓文 + 刃口霜光）
# 塔盾：盾面 1024 底色 / 法线 / 自发光（霜蚀暗铁板 + 铆钉 + 中央碎裂誓约徽记透幽魂绿光，同胸甲徽记）；握柄皮革 256
import numpy as np, cv2, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from texlib import noise, GHOST, GHOST2
D = sys.argv[1].rstrip('/') + '/'; rng = np.random.default_rng(31)
def nrm_from(h, k):
    dx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); dy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
    n = np.dstack([-dx * k, dy * k, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True); return ((n * 0.5 + 0.5) * 255).astype(np.uint8)[:, :, ::-1]
# ---- 剑身
W, Hh = 512, 1024; yy, xx = np.mgrid[0:Hh, 0:W].astype(np.float32); u = xx / W; v = yy / Hh
fuller = np.exp(-((u - 0.5) / 0.07) ** 2) * (v < 0.72)                    # 血槽（到剑身七成）
edge = np.clip((np.abs(u - 0.5) - 0.38) / 0.12, 0, 1)                      # 刃口
scr = noise(rng, 300, 0.6, 1024)[:Hh, :W] * 0.5 + noise(rng, 60, 2, 1024)[:Hh, :W] * 0.5
frost = np.clip(noise(rng, 24, 4, 1024)[:Hh, :W] * 0.7 + 0.2 * v, 0, 1) * np.clip(noise(rng, 200, 0.8, 1024)[:Hh, :W] + 0.5, 0, 1)
base = np.array([88, 84, 78], np.float32) * (1 + 0.12 * scr[..., None]) * (1 - 0.35 * fuller[..., None])
base = base * (1 - 0.4 * frost[..., None]) + np.array([214, 214, 200]) * 0.4 * frost[..., None]
base = base * (1 - 0.5 * edge[..., None]) + np.array([200, 205, 205]) * 0.5 * edge[..., None]
# 誓文：血槽里一列方块刻字（随机笔画格），幽魂绿
runes = np.zeros((Hh, W), np.float32)
for i, y0 in enumerate(range(60, int(Hh * 0.68), 46)):
    g = rng.random((5, 3)) > 0.45; g[2, 1] = True
    for (r, c), on in np.ndenumerate(g):
        if on: cv2.rectangle(runes, (int(W * 0.5 - 15 + c * 10), y0 + r * 7), (int(W * 0.5 - 15 + c * 10 + 7), y0 + r * 7 + 4), 1.0, -1)
runes = cv2.GaussianBlur(runes, (0, 0), 1.0)
E = GHOST2 * np.clip(runes * 1.2, 0, 1)[..., None] + GHOST * (edge ** 3 * 0.35 * np.clip(noise(rng, 40, 3, 1024)[:Hh, :W], 0, 1))[..., None]
base = base * (1 - 0.6 * runes[..., None]) + GHOST2 * 0.6 * runes[..., None]
h = -fuller * 1.2 + scr * 0.08 - runes * 0.4 + frost * 0.15
cv2.imwrite(D + 'blade_base.png', base.clip(0, 255).astype(np.uint8)); cv2.imwrite(D + 'blade_emi.png', cv2.resize(E.clip(0, 255).astype(np.uint8), (256, 512)))
cv2.imwrite(D + 'blade_nrm.png', cv2.resize(nrm_from(h.astype(np.float32), 3.0), (256, 512), interpolation=cv2.INTER_AREA))
# ---- 盾面 1024（u 横、v 竖，盾面朝外）
S = 1024; yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
plate = (np.abs(((xx - 0.5) * 3) % 1 - 0.5) < 0.012) * 1.0 + (np.abs(((yy) * 4) % 1 - 0.5) < 0.008) * 0.6   # 甲板拼缝
rim = np.clip(1 - np.minimum.reduce([xx, 1 - xx, yy, 1 - yy]) / 0.05, 0, 1)
riv = np.zeros((S, S), np.float32)
for cx in [0.08, 0.92]:
    for cy in np.linspace(0.08, 0.92, 9): cv2.circle(riv, (int(cx * S), int(cy * S)), 9, 1.0, -1)
for cx in np.linspace(0.08, 0.92, 7):
    for cy in [0.06, 0.94]: cv2.circle(riv, (int(cx * S), int(cy * S)), 9, 1.0, -1)
riv = cv2.GaussianBlur(riv, (0, 0), 2.5)
scr = noise(rng, 400, 0.6, S) * 0.5 + noise(rng, 80, 2, S) * 0.5
frost = np.clip(noise(rng, 20, 5, S) * 0.8 - 0.1, 0, 1) * np.clip(noise(rng, 120, 1.6, S) + 0.6, 0, 1)
rust = np.clip(noise(rng, 30, 3, S) - 1.2, 0, 1)
base = np.array([70, 70, 64], np.float32) * (1 + 0.15 * scr[..., None])
base = base * (1 - 0.3 * frost[..., None]) + np.array([210, 212, 196]) * 0.3 * frost[..., None]
base = base * (1 - 0.6 * rust[..., None]) + np.array([40, 60, 95]) * 0.6 * rust[..., None]
base = base * (1 - 0.35 * rim[..., None]) + np.array([110, 112, 108]) * 0.35 * rim[..., None]
base = base * (1 - 0.3 * plate[..., None])
# 誓约徽记：盾形轮廓 + 竖剑 + 裂纹（与胸甲徽记呼应）
emb = np.zeros((S, S), np.float32); cxp, cyp = S // 2, int(S * 0.45)
pts = np.array([[cxp - 150, cyp - 170], [cxp + 150, cyp - 170], [cxp + 150, cyp + 40], [cxp, cyp + 210], [cxp - 150, cyp + 40]], np.int32)
cv2.polylines(emb, [pts], True, 1.0, 14); cv2.line(emb, (cxp, cyp - 140), (cxp, cyp + 170), 1.0, 16); cv2.line(emb, (cxp - 80, cyp - 70), (cxp + 80, cyp - 70), 1.0, 14)
crack = np.zeros((S, S), np.float32); p = np.array([cxp + 20.0, cyp - 160.0])
for _ in range(3):
    q = p.copy()
    for _ in range(14): n2 = q + rng.normal([0, 26], [14, 6]); cv2.line(crack, tuple(q.astype(int)), tuple(n2.astype(int)), 1.0, 3); q = n2
    p = p + rng.normal([0, 60], [40, 20])
glowm = np.clip(cv2.GaussianBlur(emb, (0, 0), 2) + cv2.GaussianBlur(crack, (0, 0), 1.2), 0, 1)
halo = cv2.GaussianBlur(glowm, (0, 0), 18) * 0.5
base = base * (1 - 0.7 * glowm[..., None]) + GHOST2 * 0.7 * glowm[..., None]
E = GHOST2 * np.clip(glowm * 1.1, 0, 1)[..., None] + GHOST * np.clip(halo, 0, 0.4)[..., None]
h = -plate * 0.8 + riv * 1.5 + rim * 0.8 + scr * 0.1 + frost * 0.2 + emb * 0.8 - crack * 0.6
cv2.imwrite(D + 'shield_base.png', base.clip(0, 255).astype(np.uint8)); cv2.imwrite(D + 'shield_emi.png', cv2.resize(E.clip(0, 255).astype(np.uint8), (512, 512), interpolation=cv2.INTER_AREA))
cv2.imwrite(D + 'shield_nrm.png', cv2.resize(nrm_from(h.astype(np.float32), 2.5), (512, 512), interpolation=cv2.INTER_AREA))
# ---- 握柄皮革 256
g = noise(rng, 64, 0.8, 256); yy = np.mgrid[0:256, 0:256][0] / 256
wrap = (np.sin(yy * np.pi * 2 * 14) > 0.6) * 1.0
lea = np.array([30, 40, 52], np.float32) * (1 + 0.25 * g[..., None]) * (1 - 0.35 * wrap[..., None])
cv2.imwrite(D + 'grip_base.png', lea.clip(0, 255).astype(np.uint8))
cv2.imwrite(D + 'pv_props.jpg', np.hstack([cv2.resize(cv2.imread(D + 'blade_base.png'), (256, 512)), cv2.resize(cv2.imread(D + 'shield_base.png'), (512, 512)), cv2.resize(E.clip(0, 255).astype(np.uint8), (512, 512))]))
print('ok')
