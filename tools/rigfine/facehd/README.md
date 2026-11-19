# 首领脸部高清（零积分，本地 AI）— raidA 11-01 戈尔顿 v3

起因：Lux3D 原贴图 2048 里脸只占约 124² 纹素（UV 面积 0.42%），眼睛基本是糊团；参照的六职业靠 1024 脸部贴花（~391² 纹素覆盖脸）才清楚。

流程（中间文件在 /workspace/work/gordon_v3/，模型不入库）：
1. `node tools/rigfine/glbdump.mjs 显示件.glb 前缀` 导出 位置/法线/UV/索引/贴图。
2. `ras.py` 正面正交投影渲脸部窗口（原贴图双线性采样）→ face_lo.png。
3. `restore.py` 按 左眼/右眼/嘴中 三点仿射对齐 FFHQ 模板 → CodeFormer（w=0.8，facefusion onnx）修复 512 → `esr2.py` Real-ESRGAN x4 分块超分（每块约 9 s，分批跑防超时）。
4. `fix.py` 去内眼角/鼻梁白斑（inpaint）、眼周锐化、虹膜压暗、缺高光的眼补角膜高光。
5. `comp.py` 选正面可见三角（可见比例>0.8、朝前）→ 高清图回贴到 1024 脸部贴图，选区边缘羽化回原贴图投影色（接缝不花），颜色均值对齐原图。`eyelift.py` 眼窝暗部提亮。
6. `node tools/rigfine/gordon_facetex.mjs`：选中三角拆成 MI_GordonFace（UV0=正面投影，UV1=原 UV 采样金属粗糙度），`NONRM=1` 脸部不用烘焙法线、`SMOOTH=0.30` 头部（y>0.30）焊接重算平滑法线（原件分面法线是脸上三角色块的主因）。
7. `MRTEX=1024 node tools/lux3d-weightxfer.mjs 绑骨件 显示件 输出`（已支持多 primitive）。
一键：`bash tools/rigfine/facehd/build_gordon.sh 脸部贴图.png 出图目录`（含 NONRM/SMOOTH 环境变量）。

模型（onnxruntime 1.31 aarch64 CPU 可跑）：https://huggingface.co/facefusion/models-3.0.0/resolve/main/{codeformer,gfpgan_1.4,real_esrgan_x4}.onnx
