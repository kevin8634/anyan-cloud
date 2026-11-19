#!/bin/bash
# raidA 11-02 维尔格首领化一键组装（0 积分，不调用 Lux3D / Aholo / Mixamo 任何接口）：bash tools/rigfine/virg_boss/run.sh
# 中间件目录 W=/workspace/work/bossw/virg（不入库）。原始件 /workspace/work/lux3d_raw/4579125/textured.glb（G1 29.7 万面，之前已下载的本地副本）
# 绑骨件 /workspace/work/tpose/virg/rigged.glb（Lux3D humanoid auto-rig 4579676，14852 面，52 骨）
set -e; cd "$(dirname "$0")/../../.."; W=${W:-/workspace/work/bossw/virg}; RAW=${RAW:-/workspace/work/lux3d_raw/4579125/textured.glb}; RIG=${RIG:-/workspace/work/tpose/virg/rigged.glb}
OUT=${OUT:-assets_aholo/dlc1/creatures_pilot/wl_virg_boss.glb}; mkdir -p $W
# 1. 区域压面 4 万（头 1.1 万，UV 接缝保留）→ 从原始件烘 2048 法线 → 绑骨件权重转移
#    （creatures_pilot/wl_virg_t_rigged.glb 的 39666 面显示件是不保 UV 接缝压出来的：4055 个三角跨 UV 岛，贴图被拉成碎块，弃用）
node tools/rigfine/gordon_regionsimp.mjs $RAW $RIG $W/disp40k.glb --head 11000 --body 29000 | tail -1
node tools/rigfine/gordon_nrmbake.mjs $RAW $W/disp40k.glb $W/disp_nrm.glb --size 2048 | tail -1
node tools/lux3d-weightxfer.mjs $RIG $W/disp_nrm.glb $W/rig40k.glb --tex 2048 | tail -1
# 2. 导出贴图 + UV 三角表 → 贴图首领化 / 附件贴图
node tools/rigfine/virg_boss/exttex.mjs $W/rig40k.glb $W
node tools/rigfine/virg_boss/uvdump.mjs $W/rig40k.glb $W
python3 tools/rigfine/virg_boss/skin.py $W
python3 tools/rigfine/virg_boss/props.py $W
# 2b. 11-03 脸部高清 + 幽魂眼（Rhett 11-03 18:06 批，0 积分）：FACE=1 bash run.sh。独立 2048 脸拆成 MI_VirgFace，头部平滑法线
if [ -n "$FACE" ]; then
  mkdir -p $W/fh; node tools/rigfine/glbdump.mjs $W/disp_nrm.glb $W/fh/d | tail -1
  F=tools/rigfine/virg_boss/facehd.py; python3 $F virg lo; python3 $F virg cf; rm -f $W/fh/gx4.npy; for a in 0 4 8 12; do python3 $F virg esr $a $((a+4)); done; python3 $F virg comp
  RECT=-0.065,0.065,0.315,0.445   # = facehd.py CFG rect
  NONRM=1 SMOOTH=0.345 node tools/rigfine/gordon_facetex.mjs $W/disp_nrm.glb $W/fh/face_base.png $W/fh/face_tris.bin $RECT $W/disp_face.glb | tail -1
  # 原绑骨件不在（沙箱重置）时：用同几何的 rig40k.glb 当源转一次，再 wcopy.mjs 按顶点原样搬权重（与原绑骨件转出的逐位一致，11-03 萨琳实测 0 差）
  if [ -f "$RIG" ]; then node tools/lux3d-weightxfer.mjs $RIG $W/disp_face.glb $W/rig40k_face.glb --tex 2048 | tail -1
  else node tools/lux3d-weightxfer.mjs $W/rig40k.glb $W/disp_face.glb $W/rig40k_face.glb --tex 2048 | tail -1
       node tools/rigfine/facehd/wcopy.mjs $W/rig40k.glb $W/rig40k_face.glb $W/rig40k_face.glb | tail -1; fi
  node tools/rigfine/virg_boss/build.mjs $W/rig40k_face.glb $OUT $W 2>&1 | grep -v -i warn | grep -v '^prune' | tail -14; exit 0
fi
# 3. 体型 + 贴图 + 巨剑 / 塔盾 + 逐技能动画
node tools/rigfine/virg_boss/build.mjs $W/rig40k.glb $OUT $W 2>&1 | grep -v -i warn | grep -v '^prune' | tail -14
# 4. 出图（需可用内存 ≥ 4 GB；与展示区窗口错开）：静帧 + 每技能 GIF + 对照图 → 见 shots.sh
