#!/bin/bash
# raidA A9 首领逐招出图：bash tools/rigfine/a9/shots.sh <id> <中文名> [片段列表|all]
# 帧 → /workspace/work/a9shots/<id>/（不入库）；GIF → docs/黑客松素材/对照/A9_逐招/<中文名>/（gif.py 横拼右前 3/4 + 右侧，标出手时刻）
cd "$(dirname "$0")/../../.."; export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
ID=$1; N=$2; CL=${3:-all}; O=/workspace/work/a9shots/$ID; G=assets_aholo/dlc1/creatures/wl_${ID}_boss.glb
mkdir -p $O; rm -rf $O/anim/frames_*
CAMS=${CAMS-} W=${W:-320} FPS=${FPS:-10} GCAM=${GCAM:-q34r,sider} node tools/rigfine/virg_boss/shoot.mjs $G $O/anim $CL || exit 1
python3 -c "import json;d=json.load(open('tools/rigfine/a9/out_$ID.json'))['clips'];json.dump(d,open('$O/anim/meta.json','w'),ensure_ascii=False)"
python3 tools/rigfine/virg_boss/gif.py $O/anim "$N" "docs/黑客松素材/对照/A9_逐招/$N" A9_$ID && echo SHOTS_DONE
