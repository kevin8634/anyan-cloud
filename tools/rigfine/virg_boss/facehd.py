# raidA 11-03 维尔格 / 萨琳 脸部高清 + 幽魂眼（0 积分，本地 CodeFormer / Real-ESRGAN，照摆渡死渡 fh/ 流程）
# 中间件 W=/workspace/work/bossw/<boss>/fh（d.* = glbdump disp_nrm.glb；face_lo.png = 正面投影 1024，见 rhead 步骤）
# python3 facehd.py <boss> lo      → 正面投影 face_lo.png（先 node tools/rigfine/glbdump.mjs <W>/disp_nrm.glb <W>/fh/d）
# python3 facehd.py <boss> cf      → CodeFormer w0.8 → 亡灵肤色（灰绿、去血色、眼窝 / 颧下凹陷）→ 人眼抹掉 → graded.png、eye_emi512.png
# python3 facehd.py <boss> esr a b → Real-ESRGAN x4 分块（graded.png → gx4.npy），共 16 块
# python3 facehd.py <boss> comp    → 2048 脸底色 + 细节法线 K=0.6 + 幽魂眼火自发光 + 脸部三角表（face_base/face_nrm/face_emi.png、face_tris.bin）
import sys, os, numpy as np, cv2
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../facehd'))
B, step = sys.argv[1], sys.argv[2]
W = f'/workspace/work/bossw/{B}/fh/'; os.chdir(W)
TPL = np.float32([[192.98, 239.95], [318.90, 240.19], [256.0, 371.0]])
# 1024 投影窗口里的 左眼 / 右眼 / 嘴中（看 face_lo.png 定）与脸部皮肤椭圆（中心 x,y, 半轴 rx,ry）
CFG = {'virg': dict(pts=[[339, 198], [672, 198], [506, 506]], ell=(510, 415, 350, 365), rect=(-0.065, 0.065, 0.315, 0.445)),
       'sarin': dict(pts=[[320, 371], [653, 371], [486, 666]], ell=(486, 500, 290, 335), rect=(-0.062, 0.068, 0.345, 0.475), rim=(0.81, 75))}[B]
# 11-03 萨琳：椭圆原中心 452 偏左，右眼外侧被侵蚀 / 椭圆切掉（眼火外晕被裁、inpaint 拖出青色条）→ 中心移到两眼中点 486、rx 290；
#   外圈（r²≥0.81）再要求投影平均亮度 >75，把头发暗三角排除在选区外（rim=(r², 亮度)）
C_CORE = np.array([208, 255, 96], np.float32)    # 0x60ffd0（BGR）
C_HALO = np.array([224, 240, 80], np.float32)    # 0x50f0e0（BGR）
K = 0.6; S = 2048
if step == 'lo':   # 正面正交投影 1024（底色 = skin.py 首领化后的 base_<boss>.png）
    from ras import load, render
    pos, uv, idx, nrm = load(W + 'd'); X0, X1, Y0, Y1 = CFG['rect']
    tex = cv2.imread(f'../base_{B}.png')[:, :, ::-1].astype(np.float32)
    img, tid, zb, _ = render(pos, uv, idx, tex, X0, X1, Y0, Y1, 1024)
    cv2.imwrite('face_lo.png', img[:, :, ::-1].clip(0, 255).astype(np.uint8)); np.save('face_lo.png.tid.npy', tid); print('lo', img.shape)
elif step == 'cf':
    import onnxruntime as ort
    lo = cv2.imread('face_lo.png')
    A, _ = cv2.estimateAffinePartial2D(np.float32(CFG['pts']), TPL)
    crop = cv2.warpAffine(lo, A, (512, 512), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    s = ort.InferenceSession('/workspace/work/gordon_v4/models/codeformer.onnx', providers=['CPUExecutionProvider'])
    x = ((crop[:, :, ::-1].astype(np.float32) / 255 - 0.5) / 0.5).transpose(2, 0, 1)[None]
    y = s.run(None, {'input': x, 'weight': np.array(0.8, np.float64)})[0][0].transpose(1, 2, 0)
    cf = ((y.clip(-1, 1) + 1) / 2 * 255)[:, :, ::-1].astype(np.float32)
    cv2.imwrite('cf_crop.png', crop); cv2.imwrite('cf_out.png', cf.astype(np.uint8))
    org = crop.astype(np.float32)
    Lc = cv2.cvtColor(cf.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32); Lo = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = cv2.GaussianBlur(Lo[..., 0], (0, 0), 10) * 0.55 + cv2.GaussianBlur(Lc[..., 0], (0, 0), 10) * 0.45 + (Lc[..., 0] - cv2.GaussianBlur(Lc[..., 0], (0, 0), 10)) * 1.15
    # 去血色 + 灰绿：a（红绿）压到偏绿，b 轻微偏青黄
    a = cv2.GaussianBlur(Lo[..., 1], (0, 0), 8) * 0.25 + 128 * 0.75 - 8; b = cv2.GaussianBlur(Lo[..., 2], (0, 0), 8) * 0.45 + 128 * 0.55 + 3
    yy, xx = np.mgrid[0:512, 0:512].astype(np.float32)
    EY = [(193, 242), (319, 242)]
    sock = np.zeros((512, 512), np.float32)
    for ex, ey in EY: sock = np.maximum(sock, np.clip(1.25 - np.sqrt(((xx - ex) / 46) ** 2 + ((yy - ey) / 28) ** 2), 0, 1))
    sock = cv2.GaussianBlur(sock, (0, 0), 6); L = L * (1 - 0.5 * sock)
    cheek = np.zeros_like(sock)
    for ex, ey in [(170, 320), (342, 320)]: cheek = np.maximum(cheek, np.clip(1 - np.sqrt(((xx - ex) / 40) ** 2 + ((yy - ey) / 45) ** 2), 0, 1))
    L = L * (1 - 0.15 * cv2.GaussianBlur(cheek, (0, 0), 10))
    # 抹掉人眼（眼白 / 虹膜 / 高光）：眼裂区亮度压平成暗眼窝，细节只留低频
    eye = np.zeros_like(sock)
    for ex, ey in EY: eye = np.maximum(eye, np.clip(1.15 - np.sqrt(((xx - ex) / 30) ** 2 + ((yy - ey) / 15) ** 2), 0, 1))
    eye = cv2.GaussianBlur(eye, (0, 0), 3)
    L = L * (1 - eye) + (cv2.GaussianBlur(L, (0, 0), 6) * 0.35) * eye
    out = cv2.cvtColor(np.dstack([L, a, b]).clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    # 幽魂绿眼火：内核 0x60ffd0、外晕 0x50f0e0，外沿向上 / 向外飘的火舌（噪声调制），无瞳孔
    rng = np.random.default_rng(11 if B == 'virg' else 23)
    nz = cv2.GaussianBlur(rng.standard_normal((512, 512)).astype(np.float32), (0, 0), 3.5); nz /= nz.std() + 1e-6
    em = np.zeros((512, 512, 3), np.float32)
    for i, (ex, ey) in enumerate(EY):
        sx = -1 if i == 0 else 1
        r = np.sqrt(((xx - ex) / 14) ** 2 + ((yy - ey) / 8.5) ** 2)
        core = np.clip(1 - r, 0, 1) ** 1.3
        dy = np.clip((ey - yy) / 34, 0, 1)                                     # 眼上方火舌
        rf = np.sqrt(((xx - ex - sx * 10 * dy) / (16 * (1 - 0.6 * dy) + 1e-3)) ** 2 + ((yy - ey + 6) / 20) ** 2)
        flame = np.clip(1 - rf, 0, 1) ** 1.6 * np.clip(0.55 + 0.45 * nz, 0, 1) * (yy < ey + 4)
        halo = np.clip(1 - r / 2.4, 0, 1) ** 2
        em = np.maximum(em, core[..., None] * C_CORE + (0.55 * halo + 0.75 * flame)[..., None] * C_HALO)
    em = em.clip(0, 255)
    cv2.imwrite('eye_emi512.png', em.astype(np.uint8))
    g = np.clip(em.max(2, keepdims=True) / 255, 0, 1)
    out = out * (1 - 0.65 * g) + em * 0.65
    cv2.imwrite('graded.png', out.clip(0, 255).astype(np.uint8))
    cv2.imwrite('graded_pv.jpg', np.hstack([org, cf, out]).clip(0, 255).astype(np.uint8)); print('cf ok')
elif step == 'esr':
    import onnxruntime as ort
    so = ort.SessionOptions(); so.intra_op_num_threads = 2
    s = ort.InferenceSession('/workspace/work/gordon_v4/models/real_esrgan_x4.onnx', so, providers=['CPUExecutionProvider'])
    img = cv2.imread('graded.png')[:, :, ::-1].astype(np.float32) / 255; H, Wd = img.shape[:2]; T = 128; P = 8
    out = np.load('gx4.npy') if os.path.exists('gx4.npy') else np.zeros((H * 4, Wd * 4, 3), np.float16)
    tiles = [(y, x) for y in range(0, H, T) for x in range(0, Wd, T)]
    for y, x in tiles[int(sys.argv[3]):int(sys.argv[4])]:
        y0, x0 = max(y - P, 0), max(x - P, 0); y1, x1 = min(y + T + P, H), min(x + T + P, Wd)
        o = s.run(None, {'input': img[y0:y1, x0:x1].transpose(2, 0, 1)[None]})[0][0].transpose(1, 2, 0)
        oy, ox = (y - y0) * 4, (x - x0) * 4; out[y * 4:y * 4 + T * 4, x * 4:x * 4 + T * 4] = o[oy:oy + T * 4, ox:ox + T * 4]
    np.save('gx4.npy', out); print('esr', sys.argv[3:5], len(tiles))
elif step == 'comp':
    from ras import load
    pos, uv, idx, nrm = load(W + 'd')
    X0, X1, Y0, Y1 = CFG['rect']
    tid = np.load('face_lo.png.tid.npy'); Wr = 1024; Hr = tid.shape[0]
    A, _ = cv2.estimateAffinePartial2D(np.float32(CFG['pts']), TPL); Ai = cv2.invertAffineTransform(A)
    M = np.diag([2, 2, 1]) @ np.vstack([Ai, [0, 0, 1]]) @ np.diag([0.25, 0.25, 1])
    hi = np.load('gx4.npy').astype(np.float32)[:, :, ::-1].clip(0, 1) * 255
    hiW = cv2.warpAffine(hi, M[:2], (S, S), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    emi = cv2.resize(cv2.imread('eye_emi512.png').astype(np.float32), (2048, 2048), interpolation=cv2.INTER_CUBIC)
    emiW = cv2.warpAffine(emi, M[:2], (S, S), flags=cv2.INTER_LINEAR)
    lo = cv2.resize(cv2.imread('face_lo.png').astype(np.float32), (S, S), interpolation=cv2.INTER_CUBIC)
    # 三角选择：正面可见 + 朝前 + 质心在脸部皮肤椭圆内（头盔 / 头发留在身体材质）
    T = pos[idx]; n = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]); nzv = n[:, 2] / (np.linalg.norm(n, axis=1) + 1e-12)
    P2 = np.stack([(T[:, :, 0] - X0) / (X1 - X0) * Wr, (Y1 - T[:, :, 1]) / (Y1 - Y0) * Hr], -1)
    area = 0.5 * np.abs((P2[:, 1, 0] - P2[:, 0, 0]) * (P2[:, 2, 1] - P2[:, 0, 1]) - (P2[:, 2, 0] - P2[:, 0, 0]) * (P2[:, 1, 1] - P2[:, 0, 1]))
    cnt = np.bincount(tid[tid >= 0], minlength=len(idx))
    vis = np.where(area > 3, cnt / np.maximum(area, 1e-6), (cnt > 0) * 1.0)
    cx, cy, rx, ry = CFG['ell']; c2 = P2.mean(1)
    inell = ((c2[:, 0] - cx) / rx) ** 2 + ((c2[:, 1] - cy) / ry) ** 2 < 1
    m = inell & (nzv > 0.15) & (vis > 0.6)
    if 'rim' in CFG:
        g0 = cv2.cvtColor(cv2.imread('face_lo.png'), cv2.COLOR_BGR2GRAY).astype(np.float32); hit = tid >= 0
        lum = np.bincount(tid[hit], weights=g0[hit], minlength=len(idx)) / np.maximum(cnt, 1)
        rr = ((c2[:, 0] - cx) / rx) ** 2 + ((c2[:, 1] - cy) / ry) ** 2; m &= (rr < CFG['rim'][0]) | (lum > CFG['rim'][1])
    sel = np.nonzero(m)[0]
    cov = cv2.resize(np.isin(tid, sel).astype(np.uint8) * 255, (S, S), interpolation=cv2.INTER_NEAREST)
    msk = np.zeros((2048, 2048), np.float32); cv2.rectangle(msk, (96, 96), (1952, 1952), 1, -1); msk = cv2.GaussianBlur(msk, (0, 0), 56)
    cm = cv2.warpAffine(msk, M[:2], (S, S))
    cov_e = cv2.erode(cov, np.ones((37, 37), np.uint8)).astype(np.float32) / 255
    a = np.clip(cv2.GaussianBlur(cov_e * cm, (0, 0), 10) * cov_e, 0, 1)
    # 选区边缘回原投影色：原投影也去血色，接缝两侧一致
    Lb = cv2.cvtColor(lo.clip(0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32); Lb[..., 1] = (Lb[..., 1] - 128) * 0.25 + 123; Lb[..., 2] = (Lb[..., 2] - 128) * 0.45 + 129
    lo2 = cv2.cvtColor(Lb.clip(0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)
    ring = np.clip(cov.astype(np.float32) / 255 - cov_e, 0, 1); ring = cv2.GaussianBlur(ring, (0, 0), 6)[..., None]
    lo = lo * (1 - ring) + lo2 * ring
    bl = cv2.GaussianBlur(lo, (0, 0), 4); lo_s = (lo + (lo - bl) * 0.5 * K).clip(0, 255)
    out = lo_s * (1 - a[..., None]) + hiW * a[..., None]
    bb = cv2.GaussianBlur(out, (0, 0), 1.6); out = (out + (out - bb) * 0.35 * K).clip(0, 255)
    emiW *= a[..., None]
    covf = cv2.dilate(cov, np.ones((9, 9), np.uint8))
    o8 = cv2.inpaint(out.clip(0, 255).astype(np.uint8), 255 - covf, 3, cv2.INPAINT_TELEA)
    cv2.imwrite('face_base.png', o8); cv2.imwrite('face_emi.png', cv2.dilate(emiW.clip(0, 255).astype(np.uint8), np.ones((5, 5), np.uint8)))
    g = cv2.cvtColor(o8, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    h = (g - cv2.GaussianBlur(g, (0, 0), 8)) + (g - cv2.GaussianBlur(g, (0, 0), 2)) * 0.6
    eyem = cv2.GaussianBlur((emiW.max(2) > 20).astype(np.float32), (0, 0), 4); h *= 1 - eyem   # 眼火处不做凹凸
    rng = np.random.default_rng(7); nn = rng.standard_normal((S, S)).astype(np.float32); h += (cv2.GaussianBlur(nn, (0, 0), 1.1) - cv2.GaussianBlur(nn, (0, 0), 3)) * 0.03
    dx = cv2.Sobel(h, cv2.CV_32F, 1, 0, ksize=3); dy = cv2.Sobel(h, cv2.CV_32F, 0, 1, ksize=3); Sx = 6 * K
    N = np.dstack([-dx * Sx, dy * Sx, np.ones_like(h)]); N /= np.linalg.norm(N, axis=2, keepdims=True)
    cv2.imwrite('face_nrm.png', ((N * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)[:, :, ::-1])
    np.array(sel, np.uint32).tofile('face_tris.bin'); print('sel', len(sel))
    pv = o8.astype(np.float32); pv = pv * (1 - 0.5 * np.clip(cv2.imread('face_emi.png').max(2, keepdims=True) / 255, 0, 1)) + cv2.imread('face_emi.png') * 0.8
    cv2.imwrite('face_pv.jpg', np.hstack([cv2.resize(cv2.imread('face_lo.png'), (768, 768)), cv2.resize(pv.clip(0, 255).astype(np.uint8), (768, 768))]))
