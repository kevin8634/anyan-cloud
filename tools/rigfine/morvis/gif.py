# raidA 11-03 莫尔维斯 WebGL 帧 → GIF：python3 gif.py <shoot.mjs gif 帧目录> <输出目录> [fps=12]
# 每段 <clip>/f###.png，顶部写「莫尔维斯 · 动作名（id）· WebGL」与时间；动作名取 clips.mjs 的 label
import glob, os, sys, json, subprocess
from PIL import Image, ImageDraw, ImageFont
src, dst = sys.argv[1], sys.argv[2]; FPS = int(sys.argv[3]) if len(sys.argv) > 3 else 12; os.makedirs(dst, exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
lab = json.loads(subprocess.check_output(['node', '-e', f"import('{here}/clips.mjs').then(m=>console.log(JSON.stringify(Object.fromEntries(Object.entries(m.CLIPS).map(([k,v])=>[k,v.label])))))"]))
F = '/workspace/work/fonts/NotoSansCJKsc-Regular.otf'; ft = ImageFont.truetype(F, 17); fs_ = ImageFont.truetype(F, 13)
for d in sorted(glob.glob(os.path.join(src, '*'))):
    cid = os.path.basename(d); fs = sorted(glob.glob(os.path.join(d, 'f*.png')))
    if not fs: continue
    fr = []
    for i, f in enumerate(fs):
        im = Image.open(f).convert('RGB'); can = Image.new('RGB', (im.width, im.height + 30), (16, 24, 28)); can.paste(im, (0, 30)); dr = ImageDraw.Draw(can)
        dr.text((8, 5), f'莫尔维斯 · {lab.get(cid, cid).split("（")[0]}（{cid}）', font=ft, fill=(96, 255, 208)); dr.text((im.width - 92, 9), f't={i / FPS:.2f}s', font=fs_, fill=(200, 210, 220))
        fr.append(can.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    p = os.path.join(dst, f'wl_morvis_{cid}.gif'); du = [int(1000 / FPS)] * len(fr); du[-1] = 600
    fr[0].save(p, save_all=True, append_images=fr[1:], duration=du, loop=0, optimize=True); print(p, os.path.getsize(p) // 1024, 'KB')
