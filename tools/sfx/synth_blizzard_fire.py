#!/usr/bin/env python3
"""11-17 Rhett：「不要闪电的声音，暴风雪只有雪片和火焰燃烧的声音」——火系附魔暴风雪（blizzard@fire）音效改为程序合成，不再叠录音素材。
  · 雪片：风雪呼啸底（带通 250–2600 Hz 的粉噪，慢起伏）+ 细碎冰雪颗粒沙沙声（5–10 kHz 嘶声）+ 稀疏的雪粒轻击（极短高频颗粒）
  · 火焰燃烧：低沉的燃烧轰鸣（棕噪 < 450 Hz，火苗明灭式起伏）+ 噼啪爆裂（随机脉冲，1–5 kHz，指数衰减，大小不一）
  · 全部在频域 / 环形时间轴上生成 → 首尾天然无缝，可无限循环；长度与原暴风雪一致 4.66 秒；固定随机种子，可复现；-16 LUFS。
用法：python3 tools/sfx/synth_blizzard_fire.py [输出目录=assets_aholo/audio/sfx]"""
import sys, os, subprocess
import numpy as np
SR, L = 48000, 4.656
def band(n, lo, hi, tilt, rng):
    f = np.fft.rfftfreq(n, 1 / SR); X = (rng.standard_normal(len(f)) + 1j * rng.standard_normal(len(f)))
    X *= np.where((f >= lo) & (f <= hi), 1.0, 0.0) * np.power(np.maximum(f, 20), tilt)
    edge = lambda x, a, b: np.clip((x - a) / max(b - a, 1e-6), 0, 1)
    X *= edge(f, lo * 0.7, lo) * (1 - edge(f, hi, hi * 1.3))
    y = np.fft.irfft(X, n); return y / (np.abs(y).max() + 1e-9)
def circ_filter(x, lo, hi):
    f = np.fft.rfftfreq(len(x), 1 / SR); X = np.fft.rfft(x); X *= ((f >= lo) & (f <= hi)); return np.fft.irfft(X, len(x))
def lfo(n, cycles, ph, depth):   # 整数周期 = 循环无缝
    t = np.arange(n) / n; return 1 - depth + depth * (0.5 + 0.5 * np.sin(2 * np.pi * cycles * t + ph))
def synth(seed=1117):
    rng = np.random.default_rng(seed); n = int(SR * L); out = np.zeros((n, 2))
    for ch in range(2):
        r = np.random.default_rng(seed + ch * 31)
        wind = band(n, 250, 2600, -0.5, r) * (lfo(n, 2, r.uniform(0, 6), 0.45) * lfo(n, 5, r.uniform(0, 6), 0.2))
        hiss = band(n, 5000, 10000, -0.2, r) * lfo(n, 3, r.uniform(0, 6), 0.35)
        grains = np.zeros(n)
        for _ in range(int(L * 70)):
            p = r.integers(n); d = int(SR * r.uniform(0.001, 0.004)); a = r.uniform(0.05, 0.35)
            idx = (p + np.arange(d)) % n; grains[idx] += a * r.standard_normal(d) * np.exp(-np.arange(d) / (d / 4))
        grains = circ_filter(grains, 4000, 12000)
        roar = band(n, 30, 450, -1.0, r) * lfo(n, 7, r.uniform(0, 6), 0.3) * lfo(n, 3, r.uniform(0, 6), 0.25)
        crack = np.zeros(n)
        for _ in range(int(L * 26)):
            p = r.integers(n); d = int(SR * r.uniform(0.004, 0.02)); a = r.uniform(0.2, 1.0) ** 2
            idx = (p + np.arange(d)) % n; crack[idx] += a * r.standard_normal(d) * np.exp(-np.arange(d) / (d / 5))
        crack = circ_filter(crack, 900, 5500)
        nz = lambda v: v / (np.sqrt((v ** 2).mean()) + 1e-9)
        out[:, ch] = 0.55 * nz(wind) + 0.18 * nz(hiss) + 0.12 * nz(grains) + 0.5 * nz(roar) + 0.32 * nz(crack)
    out /= np.abs(out).max() / 0.89
    return out.astype(np.float32)
def write(d='assets_aholo/audio/sfx', name='m_blizzard_fire.mp3'):
    o = os.path.join(d, name); m = synth()
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-af', 'loudnorm=I=-16:TP=-2:LRA=9', '-ar', str(SR), '-b:a', '160k', o], input=m.tobytes(), check=True)
    return o
if __name__ == '__main__': print(write(*(sys.argv[1:2])))
