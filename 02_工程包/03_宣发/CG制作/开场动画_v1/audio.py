import numpy as np, soundfile as sf, subprocess
SR = 48000; T = 11.5 + 5.088; n = int(T * SR); t = np.arange(n) / SR
rng = np.random.default_rng(3)
def env(t0, a, d): x = np.clip((t - t0), 0, None); return (1 - np.exp(-x / a)) * np.exp(-x / d) * (t >= t0)
def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); s = 0.0
    # vectorised one-pole via lfilter-like cumulative approach (small n ok)
    from itertools import accumulate
    y = np.array(list(accumulate(x, lambda p, v: a * p + (1 - a) * v)))
    return y
sfx = np.zeros(n)
# 1. bell toll at 0.05s (inharmonic partials), choked slightly after 1.0s (bell cracks)
f0 = 98
for r, g, d in [(0.5, .5, 4), (1, 1, 3), (1.19, .6, 2.2), (1.56, .45, 1.6), (2, .5, 1.4), (2.66, .3, 1.0), (3.01, .25, .8), (4.1, .15, .5)]:
    sfx += g * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6)) * env(0.05, 0.004, d)
sfx *= np.where(t > 1.05, np.exp(-(t - 1.05) / 0.6), 1) * 0.35
# 2. crack + thunder at 0.95
noise = rng.standard_normal(n)
crack = noise * env(0.95, 0.001, 0.08) * 0.5
thunder = lp(noise * env(0.98, 0.05, 1.6), 300) * 2.2
sfx += crack + thunder
# 3. rain bed shot1
sfx += lp(noise, 4000) * 0.03 * np.clip(1 - (t - 3.2) / 0.4, 0, 1) * (t < 3.6)
# 4. abyss echo pulses (3.5–7) low whoom every 0.8s
for k in np.arange(3.6, 7.0, 0.8):
    sfx += np.sin(2 * np.pi * (55 + 25 * np.exp(-(t - k) * 3)) * (t - k)) * env(k, 0.03, 0.5) * 0.45
# 5. sub rumble grows 3.5 -> 10.5
rum = lp(noise, 70) * 6
sfx += rum * np.clip((t - 3.5) / 7, 0, 1) * (t < 10.6) * 0.5
# 6. eyes riser (reverse bell) 7.8 -> 9.75, then hit
rt = np.clip((t - 7.8) / 1.95, 0, 1)
riser = sum(g * np.sin(2 * np.pi * f0 * 2 * r * t) for r, g in [(1, 1), (1.19, .6), (1.56, .4), (2.66, .2)]) * (rt ** 3) * (t < 9.75)
sfx += riser * 0.25
sfx += np.sin(2 * np.pi * 42 * (t - 9.75)) * env(9.75, 0.005, 0.9) * 0.9          # sub boom
sfx += np.sin(2 * np.pi * 1870 * t) * env(9.75, 0.001, 0.35) * 0.12                 # metallic ping
sfx += np.sin(2 * np.pi * 2490 * t) * env(9.75, 0.001, 0.25) * 0.07
# music bed: Suno 2.0s.. , fade in 0.3, fade out 10.6–11.5
m, sr = sf.read('/workspace/work/trailer/suno/suno_325.wav'); m = m.mean(1) if m.ndim > 1 else m
mus = np.zeros(n); seg = m[int(2.0 * sr): int(2.0 * sr) + int(11.5 * SR)]; mus[:len(seg)] = seg
mus *= np.clip(t / 0.3, 0, 1) * np.clip((11.5 - t) / 0.9, 0, 1) * 0.55
# M1 anim original audio at 11.5
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', '/workspace/work/trailer/logo_anim/M1_logo_anim_a.mp4', '-vn', '-ac', '1', '-ar', str(SR), 'anim.wav'], check=True)
a, _ = sf.read('anim.wav'); an = np.zeros(n); s0 = int(11.5 * SR); an[s0:s0 + len(a)] = a[:n - s0]
mix = sfx + mus + an * 1.0
mix = np.tanh(mix * 0.9)
st = np.stack([mix, mix], 1)
sf.write('raw.wav', st, SR)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', 'raw.wav', '-af', 'aecho=0.8:0.6:90|230:0.25|0.15,loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', 'mix.wav'], check=True)
print('ok', T)
