# 1107 选角六职业面部重绘（05，未完成，未交 01）

## 目录
- v1_gpt平贴/：11-07 10:45 版，只换 MI_LuxFace 脸贴花（gpt 双图 edits），网格骨骼未动。Rhett 判定「怪」：灰发壳盖额头、尖刺、平贴缺立体。作废候选。
- v2_wip_几何修+写实脸/：11-07 12:10 版（当前最好），见下「v2 做法」。猎手/负棺/时砂明显更像真人；法师脸位置偏（嘴落在下巴、眼偏上），需重做对齐。
- 对比图/：G1 对比、CodeFormer 试验、v1/v2 实渲。
- face1107_中间件与工具.tgz：解到 /workspace/work/chars/face1107/（std/ redraw/ view/ ref/ geo/ dump/ 及脚本）。
- md5.txt。

## 结论
- G1 原件（猎手 4631563，仓库 05线产物_1104/猎手_v2_1104/textured.glb）贴图比 7c662c9 现贴图更糊；尖刺、灰发壳在 G1 就有 → 问题在 Lux3D 生成本身，不在减面/绑骨。其余五个 G1 需 Aholo Key（沙箱保险库没有，task/get 返回 invalid appKey）。
- 尖刺 = 兜帽/衣领三角 UV 落到衣服图集（贴图撕裂），不是几何凸出（深度检测 0 个凸点）。贴花覆盖所有正面可见三角即可盖住。
- 重绘标准（Rhett 11-01 戈尔顿）：CodeFormer + Real-ESRGAN x4 → 2048 脸底色 + 细节法线 K=0.6。单跑 CodeFormer 清楚但长相不像定稿（成童脸），故 v2 = 标准 + 定稿长相 gpt。

## v2 做法（脚本在 std/）
1. `node std/geo.mjs dump <glb> std/w/<C>`：导出 p0 位置/法线/UV/索引、脸 prim、底色贴图。
2. `python3 std/fix.py <C> 0.004 10 1.35`：焊接 → 脸部 Taubin 平滑（10 轮，r<0.55 衰减）→ 头部重算平滑法线 → 贴花 rect 放大 1.35 倍（上移 0.08）覆盖整个正面头部 → 选可见三角 → 渲 front_new.png。
3. `std/gen2.sh <C> <定稿名>`：gpt-image-1 medium edits（front_new + ref/<定稿>_face.png）。注意代理返回 1254×1254，post 里先缩 1024。
4. `python3 std/post.py <C> '<lm.json 条目>'`：按三点（左眼/右眼/嘴中，512 坐标，in=front_new，out=gpt）相似变换对齐 → ESRGAN x4（512→2048）→ 低频取 gpt、高频取超分 K=0.6 → 圆盘羽化 alpha → <C>_decal2.webp。ESRGAN 每个约 10 分钟 CPU。
5. `node std/geo.mjs apply <glb> std/w/<C> out.glb std/w/<C>_decal2.webp`：写回平滑位置/法线（int16 量化）、重建 MI_LuxFace 脸 prim、换贴花。
6. 实渲：view/（python3 -m http.server 8765；LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu，先跑 p73/tools/setup_env.sh），`node shot.mjs '[["m=O_X,N_X&dir=v5&head=1","x.png"]]'`。

## 未完成 / 下一步
- 法师：lm.json 的 in 点位估错，重标三点（看 std/w/Mage_grid.jpg）后只重跑 post+apply（0 元）。
- 四个都残留：贴花边缘几处黑色细三角（rect 外的尖刺）；头发/兜帽仍是 Lux 灰色半透明质感（底色贴图本身，可考虑把 rect 再放大或对 p0 头发区底色单独调暗，0 元）。
- 时砂脸 prim 只 201 个三角（被头发挡），眼区面积小。
- 战士、炼金未动（Rhett 认为脸已一致）。
- 没做细节法线贴图（MI_LuxFace 无 normalTexture，游戏 shader 是否读需 01 确认）。
- 验收通过后：放同名 LUX_*.glb + md5 + 材质名 MI_LuxFace + 2048 说明，通知 01 合进 models_hd。

## 花费
- gpt-image-1 medium edits：10:45 ×4 约 $0.17；11:31 ×4 约 $0.17（每次 1427 in / 1050 out）。合计约 $0.34（Rhett 批 $0.45 上限 + 11:30「可以」续批 ≤$0.35）。Aholo 0 分。
