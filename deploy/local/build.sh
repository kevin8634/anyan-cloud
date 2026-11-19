#!/usr/bin/env bash
# 构建「启动铸造服务」：Windows 单文件 exe + Linux 可执行文件 + 通用 node 单文件（macOS / Linux 装了 Node 18+ 时用）
# 用法：BUN=/path/to/bun bash deploy/local/build.sh [输出目录=dist_local]
# 需要 bun（https://bun.sh），交叉编译时 bun 会自动下载对应平台的运行时。产物不含任何 Key。
set -euo pipefail
cd "$(dirname "$0")/../.."
BUN=${BUN:-bun}; OUT=${1:-dist_local}; mkdir -p "$OUT"
SRC=deploy/local/forge_local.js
"$BUN" build "$SRC" --target=node --outfile "$OUT/启动铸造服务.js"
"$BUN" build "$SRC" --compile --minify --target=bun-windows-x64 --outfile "$OUT/启动铸造服务.exe"
"$BUN" build "$SRC" --compile --minify --target=bun-linux-x64 --outfile "$OUT/启动铸造服务_linux_x64"
"$BUN" build "$SRC" --compile --minify --target=bun-linux-arm64 --outfile "$OUT/启动铸造服务_linux_arm64"
"$BUN" build "$SRC" --compile --minify --target=bun-darwin-arm64 --outfile "$OUT/启动铸造服务_mac_arm64" || echo "（macOS 版构建失败，可用 node 启动铸造服务.js）"
ls -la "$OUT"
