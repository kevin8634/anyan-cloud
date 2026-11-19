# 莫尔维斯（wl_morvis）本地精绑 —— raidA 11-02，0 积分

Rhett 定：按原计划本地绑，不用 Lux3D 绑骨、不用 Mixamo。全流程 `bash tools/rigfine/morvis/run.sh`。

| 文件 | 作用 |
|---|---|
| `../rigfine2.py` | 通用精绑（拷自 p73，新增可选 `sk/smin/bsig` 高斯宽度配置，默认行为不变） |
| `../cfg/morvis.py` | 骨骼 24 根 + 分区 + 候选骨 + 刚性诱饵灯 |
| `simplify.mjs` | 原始件 99196 → 39868 面（同 lux3d.mjs post 做法，meshoptimizer 1.3 Permissive），贴图 2048 |
| `emi.py` | 自发光贴图：诱饵灯 0x60ffd0 满亮、诱饵杆末端渐亮、鱼皮发光脉络 0x50f0e0（3D 脊线噪声，只落青色鱼皮）、眼睛 |
| `clips.mjs` | 13 段关键帧动作（关键帧 smoothstep + 连续叠加），轴向约定见文件头 |
| `build.mjs` | 蒙皮 + 动作（30fps LINEAR）+ 材质 webp + meshopt → glb |
| `groundfix.py` + `../cfg/morvis_ground.json` | 11-03 防穿地：量成品每帧最低点（地面 y=-0.364 = 静止最低点），每帧身体抬升写 json，build.mjs 叠加到 body 平移 y；`GROUND=1 bash run.sh` 迭代，残差 0 即收敛。修前 skill_bite 落地腹鳍尖扎地 3.07、phase_crash 0.34、death 中途 6.18、idle 1.57、attack 1.85、eels/flood 约 3（模型单位 cm），修后 13 段全为 0 |
| `evalglb.mjs` + `cpurender.py` | 从成品 glb 自身读骨骼/权重/动画做 CPU 蒙皮 + 软件渲染出 GIF（浏览器被占用时的验收路径） |
| `shoot.mjs` | WebGL（chromium swiftshader）截图 / 帧序列，串行等浏览器空闲 |
| `raster.py` `labels.py` `posecpu.mjs` `dump.mjs` | 调试：正交软光栅、分区/主骨上色、按 clips.mjs 直接摆姿势 |

骨骼：root → body（身体根）→ chest（身体前段）→ head → jaw/jawEnd（下颌）、lure1-3 → lureLamp → lampEnd（诱饵杆三节 + 灯，灯刚性）；
body → tail1-3 → tailEnd（尾三节）；chest → finL/finR（+末端，前鳍肢）；body → ventL/ventR（+末端，下垂腹鳍"腿"）。

动作：idle 待机悬浮 / swim 游动 / attack 普攻咬 / skill_surge 潮涌冲击 / skill_bite 扑咬 / skill_lure 诱饵灯 / skill_drool 毒涎 /
skill_eels 寄生鳗 / skill_flood 水位上涨 / gate_tide 深渊潮葬读条（循环）/ phase_crash 转阶段撞台 / hit 受击 / death 死亡（停在末帧）。
诱饵灯脉动 = lureLamp 骨缩放通道（不依赖 KHR_animation_pointer）。
