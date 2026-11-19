#!/bin/bash
# raidA 11-02 首领莫尔维斯本地精绑全流程（0 积分：不调 Lux3D 绑骨 / Mixamo / 任何付费接口）
# bash tools/rigfine/morvis/run.sh   （中间件目录 W=/workspace/work/morvis；GIF=1 时出 CPU 渲染 GIF + 对照图）
set -e; cd "$(dirname "$0")/../../.."; W=${W:-/workspace/work/morvis}; RAW=${RAW:-/workspace/work/lux3d_raw/4513869/textured.glb}; T=tools/rigfine
OUT=${OUT:-assets_aholo/dlc1/creatures_pilot/wl_morvis_rigged.glb}; mkdir -p $W
node $T/morvis/simplify.mjs $RAW $W/disp.glb 40000                       # 99196 → ~4 万面，贴图 2048
node $T/morvis/dump.mjs $W/disp.glb $W/mesh >/dev/null                   # 网格 + 贴图（emi.py / raster.py 用）
node $T/decode.mjs $W/disp.glb $W/model.json                             # rigfine2 输入
python3 $T/rigfine2.py $T/cfg/morvis.py $W/model.json $W/rig.json $W/regions.png   # 精绑权重（24 骨）
python3 $T/morvis/emi.py $T/cfg/morvis.py $W/mesh $W/emi.png             # 深渊幽魂绿自发光
node $T/morvis/build.mjs $W/disp.glb $W/rig.json $W/emi.png $OUT         # 蒙皮 + 13 段动作 + 材质 → 成品（叠加 cfg/morvis_ground.json 每帧抬升）
# 11-03 防穿地：改了 clips.mjs 后跑 GROUND=1 —— 成品 30fps CPU 蒙皮量最低点 → groundfix.py 累加抬升 → 重建（残差 0 即收敛）
if [ -n "$GROUND" ]; then node $T/morvis/evalglb.mjs $OUT $W/ev30 30 >/dev/null; python3 $T/morvis/groundfix.py $W/ev30; node $T/morvis/build.mjs $W/disp.glb $W/rig.json $W/emi.png $OUT; fi
if [ -n "$GIF" ]; then
  node $T/morvis/evalglb.mjs $OUT $W/ev 12                                # 从成品 glb 求每帧顶点
  for c in $(node -e "console.log(Object.keys(require('$W/ev/clips.json').clips).join(' '))"); do python3 $T/morvis/cpurender.py $W/ev $c $W/frames/$c; done
fi
