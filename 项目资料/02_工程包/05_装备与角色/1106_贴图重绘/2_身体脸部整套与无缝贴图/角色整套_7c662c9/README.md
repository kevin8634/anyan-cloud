# 整套完成 · 7c662c9 原件 + 身体/脸部重绘贴花（05，2026-11-06 23:35）

**整套完成**：选角 30 级六职业以本目录 6 件为准，底网格全部是 7c662c9 原件。另加 ../LUX_Mage40Robe.glb（9276f6b2，底网格 set40 件，01 已接 8d7af8b）。上一级 LUX_Warrior/Hunter/Coffin/Mage/Chrono/Alchemy（底为 05 去碎片件）全部作废，不接。

底模 = p73 7c662c9 的 assets_aholo/models_hd/LUX_*.glb（原网格、原贴图、原骨骼不变，Mage 原件 md5 422f33e3）。
只在 mesh[0] 上追加 MI_LuxFace 图元（BLEND，同骨骼权重，平面投影 UV），顺序：身体正、身体背、脸/头。
**一件有多个 MI_LuxFace 图元，代码不得只取第一个，也不得把 MI_LuxFace 当作隐藏对象。**
手臂伸出部分（投影窗口外）保留原贴图。

| 文件 | md5 | 三角 | 底网格 | 贴花层 |
|---|---|---|---|---|
| LUX_Warrior.glb | 923ff897 | 36,929 | 7c662c9 原件 | 身体正、身体背、脸（去兜帽）、后脑长发 |
| LUX_Hunter.glb | 7a4b6117 | 37,596 | 7c662c9 原件 | 身体正、身体背、脸 |
| LUX_Coffin.glb | b97990f6 | 36,212 | 7c662c9 原件 | 身体正、身体背、脸 |
| LUX_Mage.glb | 1f385d62 | 36,946 | 7c662c9 原件 | 身体正、身体背、脸（30 级样片） |
| LUX_Chrono.glb | d3b963ae | 36,189 | 7c662c9 原件 | 身体正、身体背、脸（刘海下左眼） |
| LUX_Alchemy.glb | 2b7113eb | 36,010 | 7c662c9 原件 | 身体正、身体背、鸟嘴面具、后脑 |

替换 p73 assets_aholo/models_hd/ 同名件即可（KTX2 版请照 17b01aa 流程重编）。上一级的同名件（05 去碎片底）作废，以本目录为准。
LUX_Mage40Robe 不变（已接 17b01aa）。prev_body.jpg：上排正面、下排背面，每对左=原件、右=新件。
