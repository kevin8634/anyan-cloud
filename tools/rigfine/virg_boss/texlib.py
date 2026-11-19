# raidA 11-02 维尔格 / 萨琳首领化贴图公用函数（萨琳共用）：噪声、脉络、暗缝、岛内细节法线、出血
import numpy as np, cv2
GHOST = np.array([208, 240, 80], np.float32)    # BGR = 0x50f0d0 一带（副本主色 0x50f0e0 / 0x60ffd0）
GHOST2 = np.array([208, 255, 96], np.float32)   # 0x60ffd0
def noise(rng, n, sig, S):
    z = cv2.resize(rng.standard_normal((n, n)).astype(np.float32), (S, S), interpolation=cv2.INTER_CUBIC); z = cv2.GaussianBlur(z, (0, 0), sig); return z / (z.std() + 1e-6)
def veins(rng, S, scales=((24, 1.0), (56, 0.6)), width=0.06):
    v = np.zeros((S, S), np.float32)
    for n, w in scales:
        z = noise(rng, n, 2, S); v = np.maximum(v, np.clip(1 - np.abs(z) / width, 0, 1) * w)
    return cv2.GaussianBlur(v, (0, 0), 0.8)
def crevice(gray, isl, r=5, k=16, off=4):
    """比周围暗的细线（缝、裂、甲片接缝），只在岛内"""
    bl = blur_in(gray, isl, r); return np.clip((bl - gray - off) / k, 0, 1) * isl
def blur_in(img, isl, sig):
    """岛内归一化模糊（不把岛外的灰底 / 相邻岛色混进来）"""
    m = isl.astype(np.float32); a = cv2.GaussianBlur(img * (m if img.ndim == 2 else m[..., None]), (0, 0), sig); w = cv2.GaussianBlur(m, (0, 0), sig)
    return a / np.maximum(w if img.ndim == 2 else w[..., None], 1e-4)
def detail_normal(h, isl, strength, S_out):
    """高度 → 切线空间法线（UV 空间梯度，岛边 3 px 内淡出防接缝亮边），返回 RGB uint8（glTF：R=x G=y 向上 B=z）"""
    er = cv2.erode(isl.astype(np.uint8), np.ones((7, 7), np.uint8)).astype(np.float32); er = cv2.GaussianBlur(er, (0, 0), 1.5)
    dx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3) * er; dy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3) * er
    n = np.dstack([-dx * strength, dy * strength, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    o = ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)
    return cv2.resize(o, (S_out, S_out), interpolation=cv2.INTER_AREA)
def bleed(img, isl, px=8):
    """岛外空像素取最近岛内像素颜色（距离变换取标签；px 以外也填，避免 mip 渗灰）"""
    src = (~isl.astype(bool)).astype(np.uint8)
    _, lab = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 3, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.nonzero(src == 0); lut_y = np.zeros(lab.max() + 1, np.int32); lut_x = np.zeros(lab.max() + 1, np.int32)
    lut_y[lab[ys, xs]] = ys; lut_x[lab[ys, xs]] = xs
    return img[lut_y[lab], lut_x[lab]].astype(np.float32)
def hsv(b):
    h = cv2.cvtColor(b.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32); return h[..., 0] * 2, h[..., 1] / 255, h[..., 2] / 255
