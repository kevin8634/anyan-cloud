#!/bin/bash
# 发版：bash tools/release.sh <版本>  → 全量检查（tsc ×3、构建 ×2、纯净、内容包、加载自检、packs 两套）+ commit + tag + 打包到 releases/<版本>/
set -eo pipefail; V=$1; cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
npx tsc -p .
npx tsc -p src/web --noEmit
npx tsc -p dev/tsconfig.dlc.json --noEmit
node gen-assets.mjs >/dev/null
node build-web.mjs | tail -1
node build-web.mjs --dlc=dlc1 | tail -1
node tools/check-purity.mjs web/index.html | tail -1
# v1.2.21 资产双包：比赛版构建 + 检查（assets_aholo/ 有文件时才出比赛版产物）
rm -f web/*_比赛版.html
AHOLO_N=$(find assets_aholo -type f ! -name '*.md' | wc -l)
if [ "$AHOLO_N" -gt 0 ]; then node build-web.mjs --assets=aholo | tail -1; node build-web.mjs --assets=aholo --dlc=dlc1 | tail -1; fi
node tools/check-assets.mjs | tail -1
npm run packs 2>&1 | tail -1
node dev/smoke.mjs
for m in packs p122 p123; do timeout 600 node test/playtest.mjs $m | tail -1; PLAYTEST_DLC=dlc1 timeout 700 node test/playtest.mjs $m | tail -1; done
if [ "$AHOLO_N" -gt 0 ]; then PLAYTEST_ASSETS=aholo timeout 600 node test/playtest.mjs packs | tail -1; PLAYTEST_ASSETS=aholo PLAYTEST_DLC=dlc1 timeout 700 node test/playtest.mjs packs | tail -1; fi
# v1.2.46 铸造台：服务端（假 Lux3D + server.js，零积分）+ 浏览器端到端（比赛版 DLC）
node test/forge.test.mjs | tail -1
node dist/simGearName.js | tail -1   # v1.2.55 装备名字与手持武器类型一致
node test/glbdecimate_web.test.mjs | tail -1   # v1.2.55 导入 GLB 浏览器端减面
if [ "$AHOLO_N" -gt 0 ]; then timeout 900 node test/forge_e2e.mjs | tail -1; fi
if [ "$AHOLO_N" -gt 0 ]; then timeout 600 node test/forge_claim_e2e.mjs | tail -1; fi   # v1.2.47 定时领取
timeout 600 node test/audio_e2e.mjs | tail -1; timeout 600 node test/audio_e2e.mjs web/index_dlc1.html | tail -1   # v1.2.48 曲目 + 配音
timeout 1800 node test/weapon_stow_e2e.mjs $([ "$AHOLO_N" -gt 0 ] && echo all || echo base) | tail -1   # v1.2.48 武器收纳（每职业 闲置收纳 / 出手在手 / 脱战收回 / 受击取出；比赛版写实 + 普通版经典）
git add -A && git -c user.name=hark -c user.email=hark@local commit -qm "$V $2" && git tag "$V"
R=${RELEASE_DIR:-/workspace/work/relout}/$V; mkdir -p "$R"   # v1.2.44 默认放持久目录（/tmp 在沙箱重置时会被清空）
cp web/index.html "$R/暗岩传说_${V}_本体.html"; cp web/index_dlc1.html "$R/暗岩传说_${V}_DLC.html"
if [ "$AHOLO_N" -gt 0 ]; then cp web/index_比赛版.html "$R/暗岩传说_${V}_本体_比赛版.html"; cp web/index_dlc1_比赛版.html "$R/暗岩传说_${V}_DLC_比赛版.html"; fi
if [ -d web/music ]; then rm -rf "$R/music"; cp -r web/music "$R/music"; fi
if [ -d web/raid ]; then rm -rf "$R/raid"; cp -r web/raid "$R/raid"; fi   # A10 长副本按需加载：首领绑骨件分块，和比赛版 DLC html 放同一目录（缺了首领回退静态件）   # v1.2.48 比赛版背景曲目：和比赛版 html 放同一目录（离线双击也能播；没有 music/ 时自动回退程序化音乐）
D=$(basename "$PWD"); (cd .. && rm -f /tmp/rel.zip && zip -qr /tmp/rel.zip "$D" -x "$D/node_modules/*" "$D/dist/*") && cp /tmp/rel.zip "$R/暗岩传说_${V}_工程包.zip"
echo "RELEASED $V"; ls -la "$R"
