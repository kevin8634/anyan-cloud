# 选角七件 AO + 金属度/粗糙度分区（05，2026-11-08 18:3x，0 积分）

底：六件 = g1face_选角脸 v2（01 已接 98c80d9）；炼金 = 11-06 orig_7c662c9_身体加脸/LUX_Alchemy。
改动：
1. 顶点 AO：底网格多方向深度遮挡算出，写进所有图元（含全部 MI_LuxFace）的 COLOR_0（RGBA8 归一化，强度 0.5）。GLTFLoader 会自动开 vertexColors，缝隙、甲片下沿、腋下变暗。
2. 身体正/背两层（第 1、2 个 MI_LuxFace）加 metallicRoughness 贴图（1024 webp，按重绘颜色分区：低饱和带高光的甲片为金属，皮革、布料、皮肤为非金属），metallicFactor 1、roughnessFactor 1。头、脸层不变（M0 R0.7）。法师 40 无身体层，只加 AO。
3. 网格、骨骼、底色贴图、图元顺序都不变。

| 文件 | md5 | 大小 B |
|---|---|---|
| LUX_Warrior.glb | 194076fe | 5,025,864 |
| LUX_Hunter.glb | ba85e04e | 3,261,708 |
| LUX_Coffin.glb | 4aa8676b | 3,508,432 |
| LUX_Mage.glb | f1829700 | 3,733,876 |
| LUX_Chrono.glb | fc1d13b1 | 3,813,296 |
| LUX_Mage40Robe.glb | 29b4c07e | 2,703,424 |
| LUX_Alchemy.glb | 49f7134d | 4,498,784 |

**代码注意**：金属度只有在场景有环境贴图时才显出反光；无 envMap 时金属面会偏暗。选角场景请加 scene.environment（RoomEnvironment + PMREMGenerator，intensity 约 0.4–0.6），配合三点布光。若 KTX2 流程会丢 COLOR_0，请保留该属性。
prev_pbr.jpg：模拟光照、无环境贴图，每对左为原、右为加 AO 与分区（只画身体层）。
工具：chars/tex1106/pbr/（dumpdec.mjs、ao.py、mrcolor.py、apply.mjs、preview.py）。
