#!/bin/bash
# raidA 11-02 摆渡双子成品组装：bash tools/rigfine/ferry_boss/run.sh death|life  （中间件目录 F=/workspace/work/ferry，云盘 02_工程包/长副本分支/中间件/）
# v2（Rhett 11-02 09:10 三条）：facesel.py 重选脸部三角（兜帽三角回身体材质）→ 脸部拆分 + 权重转移 → dump 网格 → hood.py 兜帽投影重绘 / 颈部缝光 → build.mjs（下摆贴腰 + 包住外套）
# V1=1 走 v1 流程（原 face_tris.bin，不重绘兜帽）
set -e; MODE=${1:-death}; F=${F:-/workspace/work/ferry}; cd "$(dirname "$0")/../../.."
FB=$F/fh/face_base.png; [ $MODE = life ] && FB=$F/face_life_base.png
if [ -n "$V1" ]; then TR=$F/fh/face_tris.bin; S=""; else TR=$F/fh/face_tris_v2.bin; S=_v2; [ -f $TR ] || python3 tools/rigfine/ferry_boss/facesel.py $F; fi
NONRM=1 SMOOTH=0.38 node tools/rigfine/gordon_facetex.mjs $F/disp_nrm.glb $FB $TR -0.06,0.06,0.36,0.48 $F/disp_face_$MODE$S.glb | tail -1
MRTEX=1024 node tools/lux3d-weightxfer.mjs $F/death_rigged.glb $F/disp_face_$MODE$S.glb $F/rig_$MODE$S.glb 2>&1 | tail -1
if [ -z "$V1" ]; then
  node tools/rigfine/ferry_boss/dump.mjs $F/rig_$MODE$S.glb $F/v2/mesh | tail -1
  python3 tools/rigfine/ferry_boss/hood.py $F $MODE
fi
node tools/rigfine/ferry_boss/build.mjs $F/rig_$MODE$S.glb ${OUT:-assets_aholo/dlc1/creatures_pilot/wl_ferry_${MODE}_boss.glb} $F $MODE 2>&1 | grep -v -i warn | tail -5
