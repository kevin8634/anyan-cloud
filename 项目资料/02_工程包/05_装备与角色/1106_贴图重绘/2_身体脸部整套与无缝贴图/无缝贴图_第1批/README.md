# 代码模型无缝贴图 第 1 批（05，2026-11-06 23:40，Rhett 23:31 批）
每种 3 张 1024：`_basecolor.jpg`（sRGB）、`_normal.png`（OpenGL +Y，线性）、`_roughness.jpg`（线性灰度）。已做无缝（2×2 平铺见 preview_2x2.jpg）。
建议放 `assets_aholo/tex_tile/`。

| 名 | 用途 | 建议 repeat（每米） |
|---|---|---|
| rock | 石头、巨石、崖壁、礁石 | 0.5 |
| stonefloor | 石板地面、广场、墓室/井底地面 | 0.4 |
| stonewall | 石砖墙、石柱、塔身、门洞 | 0.5 |
| woodcrate | 木箱、木桶、木板、栈桥、营地木件 | 1.0 |
| rustiron | 铁链、铁栅、铁门、钟架铁件 | 1.0 |

候选文件（含几何体且出现相关字样，01 按实际物件挑）：
- rock/stonewall：dlc1 coast*.ts、belltower.ts、well_*_hd.ts、plaza_dress.ts、mirrorlake.ts、seabed.ts；web wild.ts、fieldx.ts、dungeonplus.ts、raid.ts
- stonefloor：dlc1 plaza_dress.ts、raid_well.ts、well_*_hd.ts、belltower.ts；web dungeonplus.ts、raid.ts
- woodcrate：dlc1 camp_real.ts、camp_lux.ts、well_dock_hd.ts、coast_kit.ts、forge.ts；web wild.ts、fieldx.ts
- rustiron：dlc1 coast_gate.ts、belltower.ts、forge.ts、raid_well_rig.ts

用法（three.js）：
```ts
const L=new THREE.TextureLoader();const T=(f,srgb)=>{const t=L.load(f);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t};
mat.map=T('tex_tile/rock_basecolor.jpg',1);mat.normalMap=T('tex_tile/rock_normal.png');mat.roughnessMap=T('tex_tile/rock_roughness.jpg');
// 保留原 mat.color 作色调（可调亮到 #ffffff 附近再乘），每张贴图按物件尺寸设 t.repeat
```
BoxGeometry/Cylinder 自带 UV 可直接用；Dodecahedron/Icosahedron 等无合理 UV 的用三向投影（triplanar onBeforeCompile）或改 BoxGeometry UV。
第 2 批（泥地、棺木、宝箱金属、青铜钟、骨）等 Rhett 看过第 1 批效果再做。
