# bossw 中间件（raidA 首领化，11-03 20:40 更新）
不入库。含 维尔格/萨琳 首领化中间文件（virg/、sarin/：final/ 动作帧、v3/ 脸部高清渲染帧等）、acc/ 验收、对照小图。
已排除 .pw（playwright chromium，需要时 `npx playwright install chromium` 或 `bash tools/setup_env.sh`，默认装到 ~/.cache/ms-playwright）。
解压到 /workspace/work/bossw/ 后配合 raidA tools/rigfine/{virg_boss,sarin_boss,facehd} 使用。

## 11-03 20:40 变化（对应 raidA 提交见 docs/长副本分支状态.md 开头）
- sarin/fh/：萨琳脸部选区重做（facehd.py CFG sarin ell=(486,500,290,335)+rim）→ face_base/face_emi/face_nrm/face_tris.bin/face_pv.jpg 新版；dbg/ 里留旧选区 face_tris_old.bin、face_pv_old.jpg 与选区诊断 sel.py/sel.jpg。
- sarin/disp_face.glb、rig40k_face.glb 重建（权重由 tools/rigfine/facehd/wcopy.mjs 从 rig40k.glb 原样搬，原绑骨件 /workspace/work/tpose/ 已不在）。
- sarin/v3/：face2_old、face2_new（萨琳自定近景机位：正面 0:0:0.14:1.0 / 左前 -15:0.02:0.2:0.99 / 右前 35:0.01:0.16:1.0）、anim2（9 段全身帧）、animface（脸部近景 idle/shriek）；旧 face_new 为改选区前。
- virg/v3/：anim2（10 段全身帧，改脸后 glb）、animface（脸部近景 idle）。
- 模型（CodeFormer / Real-ESRGAN onnx）不在包里：https://huggingface.co/facefusion/models-3.0.0/resolve/main/{codeformer,real_esrgan_x4}.onnx → /workspace/work/gordon_v4/models/。
