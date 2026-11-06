# raidA 摆渡双子中间件包（raidA_ferry_中间件_20261102_0955.tar.gz）

打包：2026-11-02 北京时间（raidA 账号 genesis8634），对应 raidA 提交 7557163（摆渡双子 v2）。不含任何 API Key。

## 解压
    mkdir -p /workspace/work && tar xzf raidA_ferry_中间件_20261102_0955.tar.gz -C /workspace/work     # 得到 /workspace/work/ferry/
工具在仓库 raidA：tools/rigfine/ferry_boss/（默认 F=/workspace/work/ferry）。

## 目录 / 文件
| 路径 | 是什么 |
|---|---|
| raw_4550402.glb | Lux3D 原始件（任务 4550402，96642 面 / 2048；也可用 task/get 免费重下，zip 链接已过期，glb 链接有效） |
| death_rigged.glb | 已绑骨件（= 主仓 master 9e40668:assets_aholo/creatures/wl_ferry_death_t_rigged.glb，14974 面，mixamo 52 骨） |
| disp40k.glb / disp_nrm.glb / disp_nrm_normal.png / bake.log | 区域压面 4 万面显示件、96642 面烘 2048 切线法线后的显示件 |
| base_hd.png, bx4.npy, h.npy, body1024.png, nrm_bake.png | 身体 Real-ESRGAN x4 超分底色 2048、超分数组、高度图、降采样输入、烘焙法线 |
| base/nrm/emi_{death,life}.png | skin.py 输出（v1 身体贴图） |
| base/emi_{death,life}_v2.png | **v2** hood.py 输出（兜帽投影重绘、缝光压暗），build.mjs 优先读 _v2 |
| face_{base,nrm,emi}.png, face_life_*.png | v1 独立 2048 脸（死渡 / 生渡）；*_v2.png = **v2** facesel.py 补发际后的版本 |
| fh/ | 脸部投影 / CodeFormer / 超分中间件：d.*（显示件网格二进制）、tid.npy（正面投影三角 id）、cf_*（CodeFormer 输入输出）、gx4.npy（x4 超分）、face.py / grade.py / restore.py / r1.py、face_tris.bin（v1 选区）、**face_tris_v2.bin（v2 选区）** |
| disp_face*.glb, rig_{death,life}.glb | v1 脸部拆分件、v1 权重转移件（build.mjs 输入） |
| disp_face_*_v2.glb, rig_{death,life}_v2.glb | **v2** 同上（新脸部选区） |
| robe_*, pole_*, robe_pv.jpg | props.py 下摆 / 船篙贴图 |
| v2/ | v2 诊断与对照：诊断_v2.md、diag/（下摆半径剖面 radii.mjs、hood_diag.py）、mesh/（dump.mjs 导出网格）、v1dump_*（v1 成品导出）、compare.py（对照图脚本）、facesel/hood 预览图、两张 v2 对照 jpg |
| v1_shots/, shots_v2/, gif_v2/ | v1 / v2 近景静帧、v2 试动 GIF（帧目录已剔除，可重出） |
| s1–s4, v0, v1, out_*, t_*, chk_*, pv_* | 旧账号出图 / 检查图（保留原样） |
| 暗岩传说_*.jpg/gif | v1 验收图 |

## 恢复步骤
1. bash tools/setup_env.sh；npm ci；node gen-assets.mjs；export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
2. pip install opencv-python-headless numpy scipy pillow（本包验证版本：opencv 4.x headless、numpy 2.x、scipy 1.x）
3. 重组成品：bash tools/rigfine/ferry_boss/run.sh death（或 life）；V1=1 走 v1 流程；OUT=<路径> 改输出
4. 出图：STILLS_ONLY=1 CAMS=waist,waist_s,waist_b,hood,hood_l,hood_r,hood_t,face node tools/rigfine/ferry_boss/shoot.mjs <glb 相对仓库> <输出目录>；GIF：GCAM=q34|waist_q|waist_s（不加 STILLS_ONLY）
5. 需要重跑脸部 CodeFormer / 超分时（v2 未重跑）：pip install onnxruntime==1.31.*（aarch64 CPU 可跑）；模型 https://huggingface.co/facefusion/models-3.0.0/resolve/main/{codeformer,gfpgan_1.4,real_esrgan_x4}.onnx 下载到 tools/rigfine/facehd/README.md 所写位置；流程见该 README。fh/face.py 里 sys.path 指向 /workspace/work/p93/anyan/tools/rigfine/facehd，换成仓库 tools/rigfine/facehd 即可（ras.py 已入库）。

## 未打包（可重装 / 已入库）
模型权重（onnx）、pip 包、node_modules；raidA 仓库 git status 干净，所有代码改动已提交。
