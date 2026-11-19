# fix1106 ④ 选角六职业贴图「名义 2048、实际 1024 细节」零积分修复：
#   取 LUX_<职业>.glb 底色贴图 → 缩回 1024（它的真实细节量）→ 本地 Real-ESRGAN x4（gordon_v3/models/real_esrgan_x4.onnx）→ 4096 → Lanczos 到 2048
#   输出 PNG 到 /workspace/work/tex2048/<职业>_bc2048.png，再由 tools/tex2048/embed.mjs 写回 glb（webp 高质量）
# 用法：python3 tools/tex2048/esrgan.py Mage [tile=128]
import sys, io, json, struct, time, os
import numpy as np, onnxruntime as ort
from PIL import Image
cls = sys.argv[1]; T = int(sys.argv[2]) if len(sys.argv) > 2 else 128; PAD = 12
src = f'/workspace/work/p73/assets_aholo/models_hd/LUX_{cls}.glb'; out = '/workspace/work/tex2048'; os.makedirs(out, exist_ok=True)
d = open(src, 'rb').read(); off = 12; js = bn = None
while off < len(d):
    L, Ty = struct.unpack('<II', d[off:off + 8]); c = d[off + 8:off + 8 + L]; off += 8 + L
    if Ty == 0x4E4F534A: js = json.loads(c)
    else: bn = c
t = js['textures'][js['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']]
si = t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
bv = js['bufferViews'][js['images'][si]['bufferView']]; o0 = bv.get('byteOffset', 0)
img = Image.open(io.BytesIO(bn[o0:o0 + bv['byteLength']])).convert('RGB').resize((1024, 1024), Image.LANCZOS)
a = np.asarray(img, np.float32) / 255.0; H, W, _ = a.shape
sess = ort.InferenceSession('/workspace/work/gordon_v3/models/real_esrgan_x4.onnx', providers=['CPUExecutionProvider'])
res = np.zeros((H * 4, W * 4, 3), np.float32); t0 = time.time(); n = 0
ap = np.pad(a, ((PAD, PAD), (PAD, PAD), (0, 0)), mode='reflect')
for y in range(0, H, T):
    for x in range(0, W, T):
        tile = ap[y:y + T + 2 * PAD, x:x + T + 2 * PAD].transpose(2, 0, 1)[None]
        r = sess.run(None, {'input': np.ascontiguousarray(tile)})[0][0].transpose(1, 2, 0)
        h = min(T, H - y); w = min(T, W - x)
        res[y * 4:(y + h) * 4, x * 4:(x + w) * 4] = r[PAD * 4:PAD * 4 + h * 4, PAD * 4:PAD * 4 + w * 4]
        n += 1
    print(cls, f'row {y // T + 1}/{H // T}', f'{time.time() - t0:.0f}s', flush=True)
up = Image.fromarray((np.clip(res, 0, 1) * 255 + 0.5).astype(np.uint8)).resize((2048, 2048), Image.LANCZOS)
up.save(f'{out}/{cls}_bc2048.png'); print('done', cls, f'{time.time() - t0:.0f}s')
