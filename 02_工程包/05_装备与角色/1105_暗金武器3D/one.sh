#!/bin/bash
# one.sh <key>: 补白方图→四视图→G1（不自动重试）→本地预览
K=$1; D=/workspace/work/chars/weapon40/$K; mkdir -p $D/assets_aholo; cd $D; touch assets_aholo/README.md; ln -sfn /workspace/work/raidA/node_modules node_modules
source ../../env.sh; PY=/workspace/work/chars/.venv/bin/python; L=../../tools/lux3d.mjs
$PY -c "
from PIL import Image
im=Image.open('../../concept40/weapons/$K.png').convert('RGB');w,h=im.size
S=Image.new('RGB',(int(h*1.15),int(h*1.15)),im.getpixel((5,5)));S.paste(im,((S.width-w)//2,(S.height-h)//2));S.resize((1024,1024)).save('ref_sq.png')"
node $L fourview --image ref_sq.png --save fv > fv.log 2>&1
[ -f fv/4_back.png ] || { echo "$K FOURVIEW FAIL $(grep -o '任务 [0-9]*' fv.log|head -1)"; exit 1; }
LUX3D_RAW_DIR=$D/raw node $L gen --images fv/1_front34.png,fv/2_opp34.png,fv/3_side.png,fv/4_back.png --mode standard --faces 100000 --target 12000 --tex 1024 --out W40_$K.glb --use "40级暗金武器 $K" > g1.log 2>&1
G=assets_aholo/W40_$K.glb; [ -f $G ] || { echo "$K G1 FAIL $(grep -o '任务 [0-9]*' g1.log|head -1)"; exit 1; }
node ../dump.mjs $G >/dev/null 2>&1 && $PY ../rr.py W40_${K}_preview.jpg
echo "$K OK fv=$(grep -o '四视图任务 [0-9]*' fv.log|grep -o '[0-9]*') g1=$(grep -o '已创建任务 [0-9]*' g1.log|grep -o '[0-9]*') $(md5sum $G|cut -c1-8) $(stat -c%s $G)"
