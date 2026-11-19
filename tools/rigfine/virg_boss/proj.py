# raidA 11-02 贴图选区自检（不开浏览器）：把 UV 空间贴图按 T 字绑定姿势正投影到正面 / 背面，python3 proj.py <dir> <贴图.png> <out.jpg> [front|back] [px]
import numpy as np, cv2, sys, json
D = sys.argv[1].rstrip('/') + '/'; tex = cv2.imread(sys.argv[2]); out = sys.argv[3]; view = sys.argv[4] if len(sys.argv) > 4 else 'front'; N = int(sys.argv[5]) if len(sys.argv) > 5 else 900
a = np.fromfile(D + 'uv.bin', np.float32).reshape(-1, 13); meta = json.load(open(D + 'uv.json'))
TS = tex.shape[0]
# 顶点 3D 位置没导出（只导重心），用 uv.json 包围盒 + 三角重心近似不够；改为读 pos.bin（uvdump 同时导出）
P = np.fromfile(D + 'pos.bin', np.float32).reshape(-1, 3, 3)
sgn = 1 if view == 'front' else -1
X = P[..., 0] * sgn; Y = P[..., 1]; Z = P[..., 2] * sgn
lo, hi = -1.02, 1.02; sc = N / (hi - lo)
px = (X - lo) * sc; py = (hi - Y) * sc
img = np.full((N, N, 3), 40, np.uint8); zb = np.full((N, N), -9.0, np.float32)
uv = a[:, :6].reshape(-1, 3, 2) * TS
for t in np.argsort(Z.mean(1)):
    x0, x1 = int(max(0, px[t].min())), int(min(N - 1, px[t].max()) + 1); y0, y1 = int(max(0, py[t].min())), int(min(N - 1, py[t].max()) + 1)
    if x1 <= x0 or y1 <= y0: continue
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32) + 0.5
    (ax, ay), (bx, by), (cx, cy) = zip(px[t], py[t]); den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(den) < 1e-9: continue
    l0 = ((by - cy) * (xx - cx) + (cx - bx) * (yy - cy)) / den; l1 = ((cy - ay) * (xx - cx) + (ax - cx) * (yy - cy)) / den; l2 = 1 - l0 - l1
    ins = (l0 >= -0.01) & (l1 >= -0.01) & (l2 >= -0.01)
    if not ins.any(): continue
    z = l0 * Z[t, 0] + l1 * Z[t, 1] + l2 * Z[t, 2]; sub = zb[y0:y1, x0:x1]; ok = ins & (z > sub)
    if not ok.any(): continue
    u = l0 * uv[t, 0, 0] + l1 * uv[t, 1, 0] + l2 * uv[t, 2, 0]; v = l0 * uv[t, 0, 1] + l1 * uv[t, 1, 1] + l2 * uv[t, 2, 1]
    c = tex[np.clip(v.astype(int), 0, TS - 1), np.clip(u.astype(int), 0, TS - 1)]
    img[y0:y1, x0:x1][ok] = c[ok]; sub[ok] = z[ok]
cv2.imwrite(out, img); print('ok', out)
