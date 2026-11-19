#!/bin/bash
# raidA 11-02 维尔格 / 萨琳验收出图（萨琳共用）：bash tools/rigfine/virg_boss/shots.sh <glb 相对仓库> <概念图> <中文名> <前缀 virg|sarin> <出图目录> [动画列表]
# 浏览器必须串行；shoot.mjs 开浏览器前检查可用内存 ≥ 4 GB。单次 shell 有 2 分钟上限时按动画分批调用（第 6 个参数）。
set -e; cd "$(dirname "$0")/../../.."; export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/workspace/work/bossw/.pw}
G=$1; C=$2; N=$3; P=$4; O=$5; CL=${6:-}
if [ -z "$CL" ]; then
  CAMS=front TPOSE=1 W=520 node tools/rigfine/virg_boss/shoot.mjs $G $O/tpose none
  CAMS=front,q34r,back,face W=520 node tools/rigfine/virg_boss/shoot.mjs $G $O/idle none
else
  CAMS= W=320 FPS=10 node tools/rigfine/virg_boss/shoot.mjs $G $O/anim $CL
fi
