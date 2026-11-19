# 关键帧拼图（看图用）：python3 sheet.py <frames_dir> <out.jpg> [每隔 n 帧] [机位 0|1]
import glob, sys
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]; step = int(sys.argv[3]) if len(sys.argv) > 3 else 3; cam = sys.argv[4] if len(sys.argv) > 4 else '0'
fs = sorted(glob.glob(f'{d}/f*_{cam}.png'))[::step]; ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size; cols = min(6, len(ims)); rows = (len(ims) + cols - 1) // cols
can = Image.new('RGB', (cols * w, rows * h), (0, 0, 0))
for i, im in enumerate(ims):
    can.paste(im, ((i % cols) * w, (i // cols) * h)); ImageDraw.Draw(can).text(((i % cols) * w + 4, (i // cols) * h + 4), fs[i].split('/')[-1][:4], fill=(255, 255, 0))
can.save(out, quality=82)
