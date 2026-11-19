# 统计 GLB 贴图：格式 / 尺寸 / 用途（颜色 / 法线 / 其它），估算 GPU 显存（RGBA8+mip vs UASTC+mip）
import json, struct, sys, os, glob
def glb(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    n = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n; bin_ = b''
    if off < len(b):
        ln = struct.unpack_from('<I', b, off)[0]; bin_ = b[off + 8: off + 8 + ln]
    return j, bin_
def dims(d):
    if d[:8] == b'\x89PNG\r\n\x1a\n': return 'png', struct.unpack('>II', d[16:24])
    if d[:2] == b'\xff\xd8':
        i = 2
        while i < len(d):
            if d[i] != 0xff: i += 1; continue
            m = d[i + 1]
            if m in (0xc0, 0xc1, 0xc2):
                h, w = struct.unpack('>HH', d[i + 5:i + 9]); return 'jpg', (w, h)
            i += 2 + struct.unpack('>H', d[i + 2:i + 4])[0]
    if d[:4] == b'RIFF' and d[8:12] == b'WEBP':
        c = d[12:16]
        if c == b'VP8 ': w, h = struct.unpack('<HH', d[26:30]); return 'webp', (w & 0x3fff, h & 0x3fff)
        if c == b'VP8L': v = int.from_bytes(d[21:25], 'little'); return 'webp', ((v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1)
        if c == b'VP8X': return 'webp', (int.from_bytes(d[24:27], 'little') + 1, int.from_bytes(d[27:30], 'little') + 1)
    if d[:12] == b'\xabKTX 20\xbb\r\n\x1a\n':
        w, h = struct.unpack_from('<II', d, 20); sc = struct.unpack_from('<I', d, 44)[0]
        dfd_off = struct.unpack_from('<I', d, 48)[0]
        model = d[dfd_off + 12]  # colorModel
        return 'ktx2-' + {166: 'uastc', 163: 'etc1s'}.get(model, str(model)) + ('-zstd' if sc == 2 else ''), (w, h)
    return '?', (0, 0)
def images(path):
    j, b = glb(path); out = []
    use = {}
    for m in j.get('materials', []):
        p = m.get('pbrMetallicRoughness', {})
        for k, t in [('color', p.get('baseColorTexture')), ('mr', p.get('metallicRoughnessTexture')), ('normal', m.get('normalTexture')), ('occl', m.get('occlusionTexture')), ('emis', m.get('emissiveTexture'))]:
            if t is None: continue
            tex = j['textures'][t['index']]
            src = tex.get('source')
            for e in tex.get('extensions', {}).values(): src = e.get('source', src)
            use.setdefault(src, set()).add(k)
    for i, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im: continue
        bv = j['bufferViews'][im['bufferView']]
        d = b[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        f, (w, h) = dims(d)
        out.append(dict(file=os.path.basename(path), idx=i, fmt=f, w=w, h=h, bytes=len(d), use='+'.join(sorted(use.get(i, {'unused'})))))
    return out
def vram(r, mode):
    px = r['w'] * r['h'] * 4 / 3
    if r['use'] == 'unused': return 0
    if mode == 'rgba' or not r['fmt'].startswith('ktx2'): return px * 4
    return px * 1  # UASTC / BC7 / ASTC4x4 = 1 B/px；ETC1S → BC7/ETC2 也是 0.5–1 B/px
if __name__ == '__main__':
    rows = []
    for g in sys.argv[1:]:
        for p in sorted(glob.glob(g)): rows += images(p)
    json.dump(rows, sys.stdout, ensure_ascii=False)
