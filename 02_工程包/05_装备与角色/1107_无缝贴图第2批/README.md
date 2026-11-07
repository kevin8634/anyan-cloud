# 代码模型无缝贴图 第 2 批（05，2026-11-07 10:35 CST，Rhett 10:32 批 约 $0.25）
格式同第 1 批：每种 3 张 1024，`_basecolor.jpg`（sRGB）、`_normal.png`（OpenGL +Y，线性）、`_roughness.jpg`（线性灰度），已无缝（preview_2x2.jpg 五种 2×2 平铺）。建议放 `assets_aholo/tex_tile/`，用法同第 1 批 README（src/web/tiletex.ts 三向投影可直接用）。

| 名 | 用途 | 建议 repeat（每米） |
|---|---|---|
| mud | 泥地、营地/码头土路、井底湿地 | 0.4 |
| coffinwood | 棺木、负棺人棺材、墓室木件 | 1.0 |
| chestmetal | 宝箱金属面（暗铁 + 黄铜条 + 铆钉） | 1.0 |
| bronzebell | 青铜钟、钟楼铜件（铜绿） | 0.6 |
| bone | 骨堆、骨墙、尸骨坑 | 0.5 |
