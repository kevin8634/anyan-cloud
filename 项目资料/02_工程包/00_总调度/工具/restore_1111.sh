#!/usr/bin/env bash
# 暗岩传说 · 新账号 00 一键恢复 v1111（2026-11-11 20:40 CST，00 总调度 d4bb0e99 写）
# = restore_1107.sh（p73 到 dda348d、showcase、raidA、ferry、chars 旧链）
#   + 01 补 fetch（p73 wip/fix1107 → 03e8535，wip/electron1109 → 728c158）
#   + 00 中间件_1111 解到 /workspace/work（git-lfs、od、cloud1106、suno1107、bl、sg）
# 各子窗口自己的产物与中间件（03 主页/小说、05 chars 增量、06、06-2、07）由各窗口按 01_交接/交接_<编号>_*_1111.md 第 4 节自行恢复。
# 用法：bash restore_1111.sh   或   STEP=base|p73plus|mw00 bash restore_1111.sh
# 不删已有目录；已存在就跳过。
set -euo pipefail
R=${R:-/workspace/work/anyan-cloud}; W=${W:-/workspace/work}; STEP=${STEP:-all}
T=$R/02_工程包/00_总调度/工具; M=$R/02_工程包/01_开发/主线; MW=$R/02_工程包/00_总调度/中间件_1111
run(){ [ "$STEP" = all ] || [ "$STEP" = "$1" ]; }
cd "$R"; git lfs version >/dev/null 2>&1 || { sudo apt-get install -y git-lfs || { sudo apt-get update && sudo apt-get install -y git-lfs; }; }

if run base; then STEP=all bash "$T/restore_1107.sh"; fi

if run p73plus; then
  cd "$R" && git lfs pull --include="02_工程包/01_开发/主线/p73_dda348d*,02_工程包/01_开发/主线/p73_58fe916*,02_工程包/01_开发/主线/p73_054fba5*,02_工程包/01_开发/主线/p73_c3a2090*,02_工程包/01_开发/主线/p73_55bc45c*,02_工程包/01_开发/主线/p73_5f008e1*,02_工程包/01_开发/主线/p73_e602e88*,02_工程包/01_开发/主线/p73_262f62e*"
  cd $W/p73; i=0
  for n in p73_dda348d..fix1107_58fe916 p73_58fe916..fix1107_054fba5 p73_054fba5..fix1107_c3a2090 \
    p73_c3a2090..fix1107_55bc45c p73_55bc45c..fix1107_5f008e1 p73_5f008e1..fix1107_e602e88 \
    p73_e602e88..fix1107_03e8535 p73_262f62e..electron1109_728c158; do
    i=$((i+1)); git bundle verify -q "$M/$n.bundle" && git fetch -q "$M/$n.bundle" "+refs/heads/*:refs/bk/c$i/*"
  done
  git checkout -q --detach && git branch -f wip/fix1107 03e8535 && git branch -f wip/electron1109 728c158
  git for-each-ref --format='delete %(refname)' refs/bk | git update-ref --stdin
  git checkout -q wip/fix1107 && git log -1 --oneline   # 应为 03e8535
fi

if run mw00; then
  cd "$R" && git lfs pull --include="02_工程包/00_总调度/中间件_1111/*"
  cd "$MW" && md5sum -c md5.txt
  for f in 00_tools_gitlfs_arm64 00_od_scripts 00_cloud1106_scripts 00_suno1107 00_blender_bl 00_win_supergateway_cloudflared; do
    tar xzf "$MW/$f.tgz" -C $W --skip-old-files && echo "ok $f"
  done
fi
echo "完成。核对：p73 wip/fix1107=03e8535 master=5824d10 electron1109=728c158；showcase 5114eae；raidA 2796afe。"
