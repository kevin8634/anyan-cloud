# 选角面部重绘 定稿 → 01（05，11-07 14:00，0 元）
Rhett 13:43：法师、猎手可以；负棺人 12:51 认可。时砂另做（只重绘眼睛，待 Rhett 看），战士、炼金不动。
- 覆盖到 assets_aholo/models_hd/ 同名件：LUX_Mage.glb、LUX_Hunter.glb、LUX_Coffin.glb（底件 = 7c662c9 整套同名件）。md5 见 md5.txt。
- 改动：头部网格平滑（Taubin，仅脸部、位置 int16 量化写回）+ 头部平滑法线；脸贴花材质名 MI_LuxFace（透明叠加层，同 7c662c9 做法），贴花 2048×2048 webp RGBA；骨骼、蒙皮、主材质 MI_Lux 不变。
- 法师、猎手 v3：按网格几何五官对齐（gpt 定稿长相 + Real-ESRGAN x4，K=0.6）；负棺人为 v2。
- 无细节法线贴图（MI_LuxFace 无 normalTexture）；游戏 shader 若需要请 01 说。
- 请 01 接入后实渲选角画面回报（脸是否有 z-fighting / 透明排序问题）。
