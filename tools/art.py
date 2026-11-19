# 美术资源处理：把 generate_image 生成的图标图集切片、贴图做无缝处理并压缩成 JPEG → assets/icons、assets/textures
# 运行：python3 tools/art.py <原图目录>（原图是本项目用图像生成工具生成的原创图，见 assets/ART_LICENSE.md）
import sys, os
from PIL import Image, ImageFilter
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else '../work/art'
OUT_I = 'assets/icons'; OUT_T = 'assets/textures'
os.makedirs(OUT_I, exist_ok=True); os.makedirs(OUT_T, exist_ok=True)
ICON = 96

def runs(mask):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None: start = i
        if not v and start is not None:
            if i - start > 20: out.append((start, i))
            start = None
    if start is not None and len(mask) - start > 20: out.append((start, len(mask)))
    return out

def slice_atlas(path, nrows=None):
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(float).mean(axis=2)
    cols = runs((a > 22).mean(axis=0) > 0.25)
    rows = runs((a > 22).mean(axis=1) > 0.25)
    while nrows and len(rows) < nrows:   # 物体跨过了行间黑缝：把最高的一段从中间劈开
        k = max(range(len(rows)), key=lambda i: rows[i][1] - rows[i][0]); y0, y1 = rows[k]; m = (y0 + y1) // 2
        rows[k:k + 1] = [(y0, m - 13), (m + 13, y1)]
    cells = []
    for (y0, y1) in rows:
        for (x0, x1) in cols:
            w, h = x1 - x0, y1 - y0; s = min(w, h); ins = int(s * 0.035)
            cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
            box = (cx - s // 2 + ins, cy - s // 2 + ins, cx + s // 2 - ins, cy + s // 2 - ins)
            cells.append(im.crop(box))
    return cells, len(rows), len(cols)

ATLASES = {
    'atlas_test': ['sk_slash', 'sk_charge', 'sk_whirlwind', 'sk_thunderclap', 'x_hammer2', 'x_hammer3',
                   'sk_avatar', 'sk_arcane_bolt', 'sk_flame_orb', 'sk_frost_ring', 'x_rune', 'it_potion_s',
                   'mat_dust', 'sk_meteor', 'it_potion_l', 'mat_shard', 'mat_essence', 'mat_soul'],
    'atlas_items': ['it_sword', 'it_axe', 'it_staff', 'it_helm', 'it_chest', 'it_legs',
                    'it_ring', 'it_amulet', 'it_hood', 'it_robe', 'sk_arcane_bind', 'it_frost_shield',
                    'ui_gold', 'ui_quest', 'ui_anvil', 'ui_salvage', 'ui_bag', 'q_mushroom'],
    'atlas_talents': ['tl_weapon', 'tl_tough', 'tl_flame', 'tl_frost', 'tl_storm', 'tl_haste',
                      'tl_iron', 'tl_scorch', 'tl_quake', 'tl_endless', 'tl_laststand', 'tl_wrath',
                      'tl_arcane', 'tl_barrier', 'tl_fireheart', 'tl_iceheart', 'tl_arcaneheart', 'tl_quick'],
    'atlas_misc': ['tl_orbmaster', 'tl_icearmor', 'tl_wildfire', 'tl_deepfreeze', 'tl_echo', 'tl_epiphany',
                   'tl_starfall', 'en_toad', 'en_treant', 'en_cultist', 'en_rotroot', 'bs_vines',
                   'bs_poison', 'bs_gas', 'ui_portal', 'ui_camp', 'ui_class', 'ui_levelup'],
}
SKIP = {'x_hammer2', 'x_hammer3', 'x_rune'}
# 第三版：扩展装备部位（肩/背/腕/手/腰/脚、双手武器、副手）。生成图多出的重复行用 x_ 跳过
GEAR_ATLASES = {
    'atlas_gear': ['it_pauldron', 'it_cloak', 'it_bracer', 'it_gauntlet', 'it_girdle', 'it_sabaton',
                   'x_mix1', 'x_mix2', 'x_mix3', 'x_mix4', 'x_mix5', 'x_mix6',
                   'it_cloth_legs', 'it_cloth_wrap', 'it_sash', 'it_greaves', 'it_necklace', 'it_signet'],
    'atlas_gear2': ['it_mace', 'it_greatsword', 'it_greataxe', 'it_shield', 'it_wand', 'it_dagger',
                    'it_tome', 'it_orb', 'it_mantle', 'it_idol', 'it_silk_gloves', 'it_cloth_shoes',
                    'x_dup1', 'x_dup2', 'x_dup3', 'x_dup4', 'x_dup5', 'x_dup6'],
}
TRIM_TOP = {'it_cloth_legs', 'it_cloth_wrap', 'it_sash', 'it_greaves', 'it_necklace', 'it_signet'}
GEAR_ONLY = len(sys.argv) > 2 and sys.argv[2] == 'gear'   # python3 tools/art.py <原图目录> gear：只切新装备图集
if GEAR_ONLY: ATLASES = GEAR_ATLASES


sheet = []
for name, names in ATLASES.items():
    cells, r, c = slice_atlas(f'{SRC}/{name}.png', len(names) // 6)
    print(name, f'{r}x{c}', len(cells))
    assert len(cells) == len(names), (name, len(cells))
    for img, n in zip(cells, names):
        if n in SKIP or n.startswith('x_'): continue
        if n in TRIM_TOP:   # 上方混进了相邻行的物体：裁掉顶部 12%（保持正方形）
            w, h = img.size; d = int(h * 0.12); img = img.crop((d // 2, d, w - d // 2, h))
        t = img.resize((ICON, ICON), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1, 60, 2))
        t.save(f'{OUT_I}/{n}.jpg', quality=82, optimize=True, progressive=False)
        sheet.append((n, t))

if GEAR_ONLY:
    cs = Image.new('RGB', (12 * (ICON + 4), 3 * (ICON + 4)), (40, 30, 20))
    for i, (n, t) in enumerate(sheet): cs.paste(t, ((i % 12) * (ICON + 4) + 2, (i // 12) * (ICON + 4) + 2))
    cs.save('/tmp/icons_gear.png'); print('gear icons', len(sheet)); sys.exit(0)

# 头像（只取头肩部分）
p = Image.open(f'{SRC}/portraits.png').convert('RGB')
for box, n in [((160, 92, 540, 472), 'pt_warrior'), ((800, 100, 1180, 480), 'pt_mage')]:
    img = p.crop(box).resize((128, 128), Image.LANCZOS)
    img.save(f'{OUT_I}/{n}.jpg', quality=84, optimize=True); sheet.append((n, img.resize((ICON, ICON))))

# 预览图（检查用）
cols_n = 12; rows_n = (len(sheet) + cols_n - 1) // cols_n
cs = Image.new('RGB', (cols_n * (ICON + 4), rows_n * (ICON + 4)), (40, 30, 20))
for i, (n, t) in enumerate(sheet): cs.paste(t, ((i % cols_n) * (ICON + 4) + 2, (i // cols_n) * (ICON + 4) + 2))
cs.save('/tmp/icons_sheet.png'); print('icons', len(sheet))

def seamless(img):
    """把贴图做成无缝：和自身错位半张的版本按边缘距离权重混合"""
    a = np.asarray(img).astype(float); h, w = a.shape[:2]
    b = np.roll(np.roll(a, h // 2, axis=0), w // 2, axis=1)
    y = np.abs(np.linspace(-1, 1, h))[:, None]; x = np.abs(np.linspace(-1, 1, w))[None, :]
    m = np.clip(np.maximum(x, y) * 1.6 - 0.6, 0, 1) ** 1.5    # 边缘处用错位版本（错位版本中心=原图边缘，所以边缘连续）
    out = a * (1 - m[..., None]) + b * m[..., None]
    return Image.fromarray(out.astype(np.uint8))

TEX = {'grass': 512, 'dirt': 512, 'rock': 512, 'stone': 512, 'wood': 256, 'mud': 512, 'water': 256, 'parchment': 384}
for n, size in TEX.items():
    img = Image.open(f'{SRC}/tex_{n}.png').convert('RGB')
    img = seamless(img).resize((size, size), Image.LANCZOS)
    img.save(f'{OUT_T}/{n}.jpg', quality=76 if n != 'parchment' else 72, optimize=True)
    # 平铺 2x2 检查接缝
    t = Image.new('RGB', (size * 2, size * 2))
    for i in range(4): t.paste(img, ((i % 2) * size, (i // 2) * size))
    t.resize((512, 512)).save(f'/tmp/tile_{n}.png')
print('textures done')
