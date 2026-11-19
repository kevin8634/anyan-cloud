# raidA 11-02 萨琳附加件贴图（0 积分，程序化）：python3 props.py <dir>
# 拖地破烂湿长袍下摆 1024（底色带 alpha 破边 / 法线 / 自发光：湿黑墨绿布、盐霜白渍、缠挂海草条、下摆破边幽魂绿冷光）+ 漂流木灯杖 512（灰白泡水木、虫蛀孔、藤壶）
import numpy as np, cv2, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../virg_boss')); from texlib import GHOST
D = sys.argv[1].rstrip('/') + '/'; S = 1024; rng = np.random.default_rng(41)
def noise(nx, ny, sig, W=S, H=S): z = cv2.resize(rng.standard_normal((ny, nx)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC); return cv2.GaussianBlur(z, (0, 0), sig)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S   # u 绕一圈，v 自腰向下
fold = np.sin(xx * 2 * np.pi * 16 + noise(8, 4, 30) * 2.4) * 0.6 + np.sin(xx * 2 * np.pi * 37 + noise(12, 6, 20) * 3) * 0.25
weave = noise(256, 256, 0.7) * 0.25 + noise(512, 512, 0.5) * 0.15
h = fold * (0.35 + 0.65 * yy) + weave
# 破边：长短不一的布条，比摆渡更碎（溺死者的破袍）
edge = 0.9 + 0.05 * np.clip(noise(40, 1, 3, S, 1)[0], -2, 2) + 0.03 * np.clip(noise(140, 1, 1, S, 1)[0], -2, 2)
strips = np.abs(np.sin(xx * np.pi * 52 + noise(24, 1, 6, S, 1)[0] * 3))
cut = edge[None, :] - 0.09 * (strips > 0.85) - 0.04 * (strips > 0.6)
alpha = (yy < cut).astype(np.float32)
holes = (noise(48, 48, 3) > 1.5) & (yy > 0.55); alpha[holes] = 0
alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
near = np.clip(1 - (cut - yy) / 0.14, 0, 1) * alpha
salt = np.clip(noise(30, 30, 2) - 0.9, 0, 1) * (0.3 + yy)   # 盐霜白渍
weed = (np.abs(np.sin(xx * 2 * np.pi * 7 + noise(6, 3, 30) * 4)) > 0.97) * (yy > 0.25)   # 竖挂的海草条
weed = cv2.GaussianBlur(weed.astype(np.float32), (0, 0), 1.2)
col = np.array([26, 30, 22], np.float32) * (1 + 0.4 * h[..., None]) + np.array([8, 12, 4]) * noise(6, 6, 40)[..., None]
col = col * (1 - 0.5 * weed[..., None]) + np.array([30, 70, 50]) * 0.5 * weed[..., None]
col = col * (1 - 0.35 * salt[..., None]) + np.array([150, 160, 150]) * 0.35 * salt[..., None]
col = col * (1 - 0.3 * near[..., None]) + np.array([60, 90, 50]) * 0.3 * near[..., None]
em = np.clip(near ** 2.2 * 0.75 + np.clip(-h - 0.95, 0, 1) * 0.15 * yy, 0, 1); em = cv2.GaussianBlur(em, (0, 0), 1.5) * alpha
E = GHOST * em[..., None]
rgba = np.dstack([col.clip(0, 255), alpha * 255]).astype(np.uint8)
cv2.imwrite(D + 'robe_base.png', rgba); cv2.imwrite(D + 'robe_emi.png', cv2.resize(E.clip(0, 255).astype(np.uint8), (512, 512), interpolation=cv2.INTER_AREA))
dx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); dy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3)
N = np.dstack([-dx * 0.25, dy * 0.25, np.ones_like(h)]); N /= np.linalg.norm(N, axis=2, keepdims=True)
cv2.imwrite(D + 'robe_nrm.png', cv2.resize(((N * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)[:, :, ::-1], (512, 512), interpolation=cv2.INTER_AREA))
# 漂流木 512（u 绕杆，v 沿杆）
W = 512; gy, gx = np.mgrid[0:W, 0:W].astype(np.float32) / W
g = np.sin(gx * 2 * np.pi * 5 + noise(6, 40, 8, W, W) * 5) * 0.5 + noise(64, 256, 0.8, W, W) * 0.5
pits = np.clip(noise(60, 60, 1.2, W, W) - 1.6, 0, 1); barn = np.clip(noise(20, 20, 2, W, W) - 1.5, 0, 1) * (gy < 0.35)
wood = np.array([118, 128, 132], np.float32) * (1 + 0.25 * g[..., None]) * (1 - 0.6 * pits[..., None])
wood = wood * (1 - 0.6 * barn[..., None]) + np.array([170, 180, 175]) * 0.6 * barn[..., None]
wood = wood * np.array([0.92, 1.0, 0.9])
cv2.imwrite(D + 'staff_base.png', wood.clip(0, 255).astype(np.uint8))
hh = g * 0.6 - pits * 1.5 + barn * 1.2; dx = cv2.Sobel(hh, cv2.CV_32F, 1, 0, ksize=3); dy = cv2.Sobel(hh, cv2.CV_32F, 0, 1, ksize=3)
N = np.dstack([-dx * 0.4, dy * 0.4, np.ones_like(hh)]); N /= np.linalg.norm(N, axis=2, keepdims=True)
cv2.imwrite(D + 'staff_nrm.png', ((N * 0.5 + 0.5) * 255).astype(np.uint8)[:, :, ::-1])
cv2.imwrite(D + 'pv_props.jpg', np.hstack([cv2.resize(rgba[..., :3], (512, 512)), cv2.resize(E.clip(0, 255).astype(np.uint8), (512, 512)), cv2.resize(wood.clip(0, 255).astype(np.uint8), (512, 512))]))
print('ok alpha', round(float(alpha.mean()), 3))
