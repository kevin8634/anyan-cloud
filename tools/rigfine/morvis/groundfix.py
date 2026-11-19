# raidA 11-03 莫尔维斯落地防穿地：从成品 glb 的 CPU 蒙皮帧（evalglb.mjs 30fps 输出）量每帧最低点低于地面多少，
# 累加到 cfg/morvis_ground.json（每段动作每帧身体抬升量，build.mjs 叠加到 body 平移 y）。迭代到残差 0 即收敛（幂等）。
# python3 groundfix.py <evalglb 输出目录> [地面 y=-0.364] [余量=0.001]
import numpy as np, json, sys, os
ev = sys.argv[1]; G = float(sys.argv[2]) if len(sys.argv) > 2 else -0.364; MARGIN = float(sys.argv[3]) if len(sys.argv) > 3 else 0.001
CF = os.path.join(os.path.dirname(__file__), '..', 'cfg', 'morvis_ground.json')
cj = json.load(open(os.path.join(ev, 'clips.json'))); n = cj['n']; assert cj['fps'] == 30, 'evalglb 需 30fps（与 build.mjs 采样一致）'
cur = json.load(open(CF)) if os.path.exists(CF) else {}
SKIP = set()  # 11-03：死亡侧翻中途也会穿地（末帧不穿），一并抬
LOOP = {'idle', 'swim', 'gate_tide'}  # clips.mjs loop:true，首尾抬升取同值防循环跳帧  # 死亡侧翻趴地，贴地是设计，不抬
for c in cj['clips']:
    if c in SKIP: continue
    a = np.fromfile(os.path.join(ev, c + '.bin'), np.float32).reshape(-1, n, 3); m = a[:, :, 1].min(1)
    d = np.clip(G + MARGIN - m, 0, None)
    if d.max() <= 0 and c not in cur: continue
    # 平滑：前后各 3 帧取最大再 5 帧三角平均，抬升不抖
    k = 3; mx = np.array([d[max(0, i - k):i + k + 1].max() for i in range(len(d))])
    w = np.array([1, 2, 3, 2, 1.]); w /= w.sum(); sm = np.convolve(np.pad(mx, 2, mode='edge'), w, 'valid'); sm = np.maximum(sm, d)
    old = np.array(cur.get(c, [0] * len(d)), float)
    if len(old) != len(d): old = np.zeros(len(d))
    if c in LOOP: e = max(sm[0], sm[-1]); sm[0] = sm[-1] = e
    cur[c] = [round(float(x), 5) for x in old + sm]
    print(c, '残差最大 %.2f cm（模型单位×100）' % (d.max() * 100), '→ 抬升最大 %.2f' % (max(cur[c]) * 100))
json.dump(cur, open(CF, 'w')); print('写入', os.path.normpath(CF))
