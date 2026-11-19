#!/bin/bash
# 生成魔搭创空间仓库内容：bash deploy/modelscope/打包.sh <输出目录>
# 输出目录 = 创空间 git 仓库的本地克隆；脚本只复制文件，不提交
# v1.2.46：forge/ 整个目录（index.js + glbslim.js + vendor/jpeg-js），diag.js；
#   页面以 gzip 分片 public/page.gz.partNN（每片 4MB，普通 git 文件；魔搭 Docker 构建不拉 Git LFS），server.js 启动时拼回
set -e; OUT=${1:?输出目录}; ROOT=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$OUT/forge" "$OUT/public"
cp "$ROOT"/deploy/modelscope/{server.js,diag.js,Dockerfile,ms_deploy.json,.gitignore} "$OUT/"
# 创空间仓库自带的 README（卡片 YAML 头）和 .gitattributes（魔搭默认 LFS 规则）已存在就不覆盖
for f in README.md .gitattributes; do [ -e "$OUT/$f" ] || cp "$ROOT/deploy/modelscope/$f" "$OUT/"; done
sed -i "s#require(process.env.FORGE_MODULE || './forge/index.js');.*#require('./forge/index.js');#" "$OUT/server.js"
rm -rf "$OUT/forge"; mkdir -p "$OUT/forge"
cp -r "$ROOT/cloud/forge-fc/index.js" "$ROOT/cloud/forge-fc/glbslim.js" "$ROOT/cloud/forge-fc/vendor" "$OUT/forge/"
rm -f "$OUT"/public/page.gz.part* "$OUT/public/index.html" "$OUT/public/version.txt"
grep -o "GAME_VERSION = '[^']*'" "$ROOT/src/web/version.ts" | cut -d"'" -f2 > "$OUT/public/version.txt"
PAGE=${PAGE:-web/index_dlc1_比赛版.html}   # v1.2.54：PAGE=web/index_dlc1_展示版.html 部署 DLC 展示版
gzip -9 -n -c "$ROOT/$PAGE" | split -b 4194304 -d -a 2 - "$OUT/public/page.gz.part"
# v1.2.48 背景曲目（构建时复制到 web/music/）：存成 .track（避开创空间默认 LFS 规则里的 *.mp3），server.js 以 /music/<名>.mp3 提供
rm -rf "$OUT/public/music"; if [ -d "$ROOT/web/music" ]; then mkdir -p "$OUT/public/music"; for f in "$ROOT"/web/music/*.mp3; do cp "$f" "$OUT/public/music/$(basename "$f" .mp3).track"; done; fi
# v1.2.54 分包加载：PAGE=web/online/index.html 时一并带上 lazy/ 分块（预压 gzip）
rm -rf "$OUT/public/lazy"; LZ="$ROOT/$(dirname "$PAGE")/lazy"; if [ -d "$LZ" ]; then mkdir -p "$OUT/public/lazy"; for f in "$LZ"/*.js; do gzip -9 -n -c "$f" > "$OUT/public/lazy/$(basename "$f").gz"; done; fi
MD="$ROOT/$(dirname "$PAGE")/music"; if [ -d "$MD" ] && [ "$MD" != "$ROOT/web/music" ]; then mkdir -p "$OUT/public/music"; for f in "$MD"/*.mp3; do cp "$f" "$OUT/public/music/$(basename "$f" .mp3).track"; done; fi
echo "OK → $OUT（分块 $(ls "$OUT"/public/lazy 2>/dev/null | wc -l) 个）（曲目 $(ls "$OUT"/public/music 2>/dev/null | wc -l) 首；页面 $PAGE $(du -m "$ROOT/$PAGE" | cut -f1) MB → $(ls "$OUT"/public/page.gz.part* | wc -l) 个 gzip 分片）"
