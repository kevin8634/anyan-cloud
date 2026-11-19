# fix1106 KTX2 转换前后统计：每张贴图格式 / 尺寸 / 用途 / 字节数，显存估算，HTML 体积
#   python3 tools/ktx2/report.py [--csv=/workspace/work/ktx2cache/textures.csv] [--before-html=文件] [--after-html=文件]
# 显存估算口径（含 mip，×4/3）：
#   转换前：webp/jpg 解码成 RGBA8 = 4 B/px
#   转换后：UASTC / ETC1S 在桌面转 BC7、在支持 ASTC 的设备转 ASTC 4x4 = 1 B/px（2048² ≈ 5.6 MB）
#           只有 ETC2 的手机：ETC1S 不透明图转 ETC2 RGB = 0.5 B/px，UASTC 转 ETC2 RGBA = 1 B/px
#           什么压缩格式都不支持（极少）：KTX2Loader 退回 RGBA8 = 与转换前相同
import sys, os, re, glob, json, hashlib, csv
sys.path.insert(0, os.path.dirname(__file__))
from stats import images

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
CACHE = os.environ.get('KTX2_CACHE', '/workspace/work/ktx2cache'); SET = 'k1'
SCOPE = [('models_hd', lambda f: re.match(r'^LUX_\w+\.glb$', f) and not f.endswith('_raw.glb')), ('dlc1/creatures', lambda f: f.endswith('.glb'))]
arg = lambda k, d=None: next((a.split('=', 1)[1] for a in sys.argv if a.startswith(f'--{k}=')), d)

def cached(rel, path):
    h = hashlib.md5(open(path, 'rb').read()).hexdigest()[:12]
    return os.path.join(CACHE, 'glb', rel[:-4] + f'.{h}.{SET}.glb')

MB = 2 ** 20
rows, tot = [], {}
for d, t in SCOPE:
    for p in sorted(glob.glob(os.path.join(ROOT, 'assets_aholo', d, '*.glb'))):
        f = os.path.basename(p)
        if not t(f): continue
        rel = f'{d}/{f}'; grp = 'raid（副本按需）' if f.endswith('_boss.glb') else d
        c = cached(rel, p); after = {r['idx']: r for r in images(c)} if os.path.exists(c) else {}
        meta = {}
        if os.path.exists(c[:-4] + '.json'):
            for m in json.load(open(c[:-4] + '.json'))['images']: meta[m['image']] = m
        for r in images(p):
            a = after.get(r['idx']); m = meta.get(r['idx'], {})
            px = r['w'] * r['h'] * 4 / 3
            row = dict(glb=rel, grp=grp, img=r['idx'], use=r['use'], w=r['w'], h=r['h'], fmt_before=r['fmt'], bytes_before=r['bytes'],
                       fmt_after=a['fmt'] if a else '（缺缓存）', bytes_after=a['bytes'] if a else r['bytes'], psnr=m.get('psnr', ''), alpha=m.get('alpha', ''),
                       vram_before=px * 4, vram_after=px * 1 if a else px * 4,
                       vram_after_etc2=(px * (0.5 if 'etc1s' in a['fmt'] and not m.get('alpha') else 1)) if a else px * 4)
            rows.append(row)

out_csv = arg('csv', os.path.join(CACHE, 'textures.csv'))
with open(out_csv, 'w', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

def summ(R, label):
    n = len(R); miss = sum(1 for r in R if r['fmt_after'] == '（缺缓存）')
    print(f"| {label} | {n} | {sum(r['bytes_before'] for r in R)/MB:.1f} → {sum(r['bytes_after'] for r in R)/MB:.1f} | "
          f"{sum(r['vram_before'] for r in R)/MB:.0f} → {sum(r['vram_after'] for r in R)/MB:.0f} | {sum(r['vram_after_etc2'] for r in R)/MB:.0f} |{' 缺 %d' % miss if miss else ''}")

print('## 贴图格式分布（转换前 → 转换后）\n')
from collections import Counter
c = Counter((r['grp'], r['use'], f"{r['w']}x{r['h']}", r['fmt_before'], r['fmt_after']) for r in rows)
print('| 组 | 用途 | 尺寸 | 转换前 | 转换后 | 张数 |\n|---|---|---|---|---|---|')
for k, v in sorted(c.items()): print('| ' + ' | '.join(k) + f' | {v} |')
print('\n## 显存估算（MB，含 mip）与贴图字节\n')
print('| 组 | 张数 | 贴图字节 MB 前 → 后 | 显存 前（RGBA8）→ 后（BC7/ASTC） | 后（仅 ETC2 手机） |\n|---|---|---|---|---|')
for g in sorted(set(r['grp'] for r in rows)): summ([r for r in rows if r['grp'] == g], g)
summ([r for r in rows if not r['grp'].startswith('raid')], '单页内嵌合计')
summ(rows, '全部合计')
ps = [r['psnr'] for r in rows if r['psnr'] != '']
if ps:
    def q(R, k): R = sorted(R); return R[min(len(R) - 1, int(len(R) * k))]
    for kind in ('etc1s', 'uastc'):
        for use in ('srgb', 'linear', 'normal'):
            R = [r['psnr'] for r in rows if r['psnr'] != '' and kind in r['fmt_after'] and (use == 'normal') == ('normal' in r['use']) and (use != 'normal' and ((use == 'srgb') == any(u in r['use'] for u in ('color', 'emis'))) or use == 'normal')]
            if R: print(f"\nPSNR {kind} {use}: {len(R)} 张，最低 {min(R):.1f} / 中位 {q(R, .5):.1f} / 最高 {max(R):.1f} dB")
for k in ('before-html', 'after-html'):
    f = arg(k)
    if f and os.path.exists(f): print(f"\n{k}: {os.path.getsize(f):,} B（{os.path.getsize(f)/MB:.1f} MB）")
print(f'\n逐张明细：{out_csv}')
