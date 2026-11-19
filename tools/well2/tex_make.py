# 钟井 v2 无缝贴图：GPT 底色 → 最小误差切缝做无缝（无重影）→ 由亮度生成法线 / 粗糙度，全部 2048
import sys, numpy as np
from PIL import Image, ImageFilter
def seam_cols(A, B, c0, c1):
    """在列 c0..c1 内找一条从上到下的最小差异路径；返回每行切点（左边取 A、右边取 B）"""
    E = np.abs(A[:, c0:c1] - B[:, c0:c1]).sum(2)
    H, W = E.shape; M = E.copy(); bt = np.zeros((H, W), int)
    for y in range(1, H):
        l = np.r_[np.inf, M[y-1, :-1]]; r = np.r_[M[y-1, 1:], np.inf]; st = np.stack([l, M[y-1], r]); k = st.argmin(0)
        M[y] += st[k, np.arange(W)]; bt[y] = k - 1
    x = int(M[-1].argmin()); cut = np.zeros(H, int)
    for y in range(H-1, -1, -1): cut[y] = x + c0; x = min(W-1, max(0, x + bt[y, x]))
    return cut
def tile_x(img):
    N = img.shape[1]; R = np.roll(img, N // 2, axis=1); out = R.copy(); band = N // 8
    cl = seam_cols(R, img, N//4 - band, N//4 + band); cr = seam_cols(img, R, 3*N//4 - band, 3*N//4 + band)
    xs = np.arange(N)[None, :]
    # 中间（cl..cr）取原图，两侧取错位图；切口 6 px 羽化
    wl = np.clip((xs - cl[:, None]) / 6 + 0.5, 0, 1); wr = np.clip((cr[:, None] - xs) / 6 + 0.5, 0, 1); w = (wl * wr)[..., None]
    return img * w + R * (1 - w)
def tile(img): img = tile_x(img); return np.transpose(tile_x(np.transpose(img, (1, 0, 2))), (1, 0, 2))
def wrapblur(a, s):
    H, W = a.shape; fy = np.fft.fftfreq(H)[:, None]; fx = np.fft.fftfreq(W)[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * (np.pi * s) ** 2 * (fx ** 2 + fy ** 2))))
def make(src, name, strength, rlo, rhi, inv=True, seam=True):
    a = np.asarray(Image.open(src).convert('RGB').resize((2048, 2048), Image.LANCZOS), dtype=np.float64)
    if seam: a = tile(a)   # 饰件图集 / 拱面整图不做无缝
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(f'{name}_basecolor.jpg', quality=92)
    L = (a @ [0.2126, 0.7152, 0.0722]) / 255.0
    h = wrapblur(L, 1.2) - wrapblur(L, 40) * 0.85         # 去掉大块明暗，只留起伏
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength; gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-gx, gy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)   # OpenGL +Y
    Image.fromarray(((n * 0.5 + 0.5) * 255).round().astype(np.uint8)).save(f'{name}_normal.png', optimize=True)
    t = wrapblur(L, 1.0); t = (t - t.min()) / (np.ptp(t) + 1e-6); t = 1 - t if inv else t
    Image.fromarray((np.clip(rlo + (rhi - rlo) * t, 0, 1) * 255).astype(np.uint8)).save(f'{name}_roughness.jpg', quality=92)
    print(name, 'ok')
G = '/workspace/work/well2/gpt/'
JOBS = {
  'wellbrick': ('tex_wallbrick_1.png', 14, 0.62, 0.95), 'wellflag': ('tex_flagstone_2.png', 12, 0.55, 0.92),
  'wellcliff': ('tex_cliff_2.png', 14, 0.6, 0.95), 'wellarch': ('tex_arch_2.png', 12, 0.6, 0.92),
  'welliron': ('tex_rustiron_2.png', 7, 0.5, 0.92), 'wellwood': ('tex_wetwood_1.png', 7, 0.45, 0.85),
  'wellice': ('tex_ice_1.png', 3, 0.06, 0.32), 'wellbank': ('tex_blackbank_1.png', 8, 0.25, 0.8),
  # 11-07 #15 拱廊 / 栈道（GPT + 代码，Rhett 22:48 批）：UV 贴图，DLC well_arcade_hd.ts 自建材质
  'wavous': ('tex_voussoir.png', 12, 0.6, 0.93, True, False), 'wapillar': ('tex_pillar.png', 12, 0.55, 0.92),
  'watrim': ('tex_trimatlas.png', 16, 0.55, 0.92, True, False), 'wadeck': ('tex_deckplank.png', 8, 0.45, 0.85),
  'wabeam': ('tex_ironbeam.png', 8, 0.45, 0.9), 'warope': ('tex_rope.png', 10, 0.6, 0.95),
}
for k in (sys.argv[1:] or JOBS):
    s, *a = JOBS[k]; make(G + s, k, *a)
