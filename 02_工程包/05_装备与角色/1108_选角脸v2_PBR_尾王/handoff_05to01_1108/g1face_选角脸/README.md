# 选角脸按 G1 原件比例重绘 v2（05，2026-11-08 18:2x，高档）—— 待 Rhett 确认后交 01

v1（17:30，整头中档）已作废，移入 `_v1_1730作废/`，不接。

底网格：7c662c9 原件（同 11-06 orig_7c662c9_身体加脸）；法师 40 底为 11-06 的 LUX_Mage40Robe（set40 件）。
做法：G1 原件头部对齐底网格 → 第 1 层：整头（头发/兜帽）中档重绘；第 2 层：只裁脸（眉到下巴）1024×1536 gpt-image-1 high 重绘，五官位置锁定 G1，眼睛、嘴按正常人 → ECC 对位 → 椭圆羽化 MI_LuxFace 贴花，叠在第 1 层上。
- 猎手、负棺人、法师、时砂：去掉 11-06 旧脸层，换整头层 + 脸层；身体正/背层不变。
- 战士：保留 11-06 长发层和后脑层，叠 v1 脸层 + 高档脸层。
- 法师 40：去掉 11-06 旧脸层，换整头层 + 脸层。

| 文件 | md5 | 大小 B | MI_LuxFace 层数 |
|---|---|---|---|
| LUX_Warrior.glb | 29574321 | 4,845,076 | 6 |
| LUX_Hunter.glb | adae9a66 | 3,114,516 | 4 |
| LUX_Coffin.glb | a827cd4d | 3,355,384 | 4 |
| LUX_Mage.glb | b845158b | 3,575,456 | 4 |
| LUX_Chrono.glb | 156e849e | 3,661,300 | 4 |
| LUX_Mage40Robe.glb | 3e26b595 | 2,578,528 | 2 |

**代码约束**：脸层是与下层同顶点的共面透明图元，必须按图元顺序绘制，后画的盖前面的（three.js 同一 mesh 的透明图元需保持顺序，必要时设 renderOrder 递增 / polygonOffset）。全部 MI_LuxFace 都要渲染。
p73 wip/fix1107 现用 Mage/Hunter/Coffin 是 688a23f 面部定稿版，是否替换由 Rhett 定。
预览 prev_F.jpg：每对左 G1 原件、右新脸。
工具：chars/tex1106/g1face/（prep.py、prepF.py、mkalpha.py、rmprim.mjs、genF.sh）。
