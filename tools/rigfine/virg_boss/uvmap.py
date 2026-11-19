# raidA 11-02 维尔格 / 萨琳首领化：uvdump.mjs 输出 → UV 空间选区图（每像素：三角号、主骨、重心高度、法线）
# from uvmap import load; M = load(dir, S)  → dict(tri, bone, y, nz, nx, ny, x, z, names, isl)
import numpy as np, cv2, json
def load(D, S=2048):
    D = D.rstrip('/') + '/'; meta = json.load(open(D + 'uv.json')); a = np.fromfile(D + 'uv.bin', np.float32).reshape(-1, 13)
    tri = np.full((S, S), -1, np.int32)
    pts = (a[:, :6].reshape(-1, 3, 2) * S * 16).round().astype(np.int32)   # 4 位亚像素
    for t in range(len(a)):
        cv2.fillConvexPoly(tri, pts[t], int(t), lineType=cv2.LINE_8, shift=4)
    # 三角边缘外扩 2 px（UV 岛边缘采样不到的像素也归到最近三角）
    m = tri < 0; idx = tri.copy()
    for _ in range(3):
        d = cv2.dilate(np.where(idx < 0, -1, idx).astype(np.float32), np.ones((3, 3), np.uint8))
        idx = np.where(idx < 0, d.astype(np.int32), idx)
    isl = tri >= 0
    tt = np.clip(idx, 0, len(a) - 1); val = idx >= 0
    f = lambda c: np.where(val, a[tt, c], np.nan).astype(np.float32)
    return dict(tri=idx, isl=isl, bone=np.where(val, a[tt, 12], -1).astype(np.int32), x=f(6), y=f(7), z=f(8), nx=f(9), ny=f(10), nz=f(11), names=meta['names'], meta=meta, a=a)
def bones(M, *names):
    ids = [M['names'].index(n) for n in names if n in M['names']]
    return np.isin(M['bone'], ids)
