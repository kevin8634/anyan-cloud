#!/usr/bin/env bash
# 暗岩传说 · 新账号 00 一键恢复（2026-11-07 16:10 CST，00 总调度 6ca33c5a 写）
# 前提：已 clone 仓库到 $R（建议 GIT_LFS_SKIP_SMUDGE=1 clone，再由本脚本按需 lfs pull，约 2.1 GB）。
# 用法：bash restore_1107.sh            # 全部
#       STEP=p73 bash restore_1107.sh   # 只做一步：lfs | p73 | showcase | raidA | ferry | chars
# 不删任何已有目录：目标目录已存在就跳过并提示（要重做请先人工改名，删除须 Rhett 确认）。
set -euo pipefail
R=${R:-/workspace/work/anyan-cloud}; W=${W:-/workspace/work}; STEP=${STEP:-all}
G="git -c http.sslCAInfo=${SSL_CERT_FILE:-/etc/ssl/certs/ca-certificates.crt}"
M=$R/02_工程包/01_开发/主线; C5=$R/02_工程包/05_装备与角色
run(){ [ "$STEP" = all ] || [ "$STEP" = "$1" ]; }

if run lfs; then
  git lfs version >/dev/null 2>&1 || { sudo apt-get install -y git-lfs || { sudo apt-get update && sudo apt-get install -y git-lfs; }; }
  cd "$R" && git lfs install --local && git config pull.rebase true
  $G lfs pull --include="02_工程包/01_开发/主线/*.bundle,02_工程包/02_展示区/工程bundle/scene-showcase_012464e*,02_工程包/01_开发/长副本raidA/中间件/raidA_ferry_中间件_20261102_0955.tar.gz,02_工程包/03_宣发/CG制作/开场动画_v2/opening.*,02_工程包/05_装备与角色/**/*.tgz,02_工程包/05_装备与角色/1106_贴图重绘/2_身体脸部整套与无缝贴图/角色整套_7c662c9/*,02_工程包/05_装备与角色/1107_面部重绘/**"
fi

if run p73; then
  if [ -e $W/p73 ]; then echo "跳过 p73：$W/p73 已存在"; else
  git clone -q "$M/暗岩传说_v1.2.72_e785590.bundle" $W/p73 && cd $W/p73
  i=0
  for n in p73_e785590..d70cbae p73_d70cbae..70d9923 p73_70d9923..0e498b8 p73_0e498b8..d5e86b1 \
    p73_master_d5e86b1..4b72056 p73_master_4b72056..71f71da p73_master_71f71da..c2d9879 \
    p73_feat-hunter-bow_c2d9879..2bed971 p73_master_c2d9879..0224040 p73_master_0224040..1e6201a \
    p73_master_1e6201a..f304b15 "p73_f304b15..c5b5a8c+097fc74" "p73_f72f6c5..a28ada9+097fc74" \
    p73_wip-dark40-3d_a28ada9..8a398cd "p73_f72f6c5..940777b+7463543" p73_940777b..5824d10 \
    p73_5824d10..captain1106 p73_23d3fc7..ktx2-1106_1b36743 p73_1b36743..fix1107_34cd8f8 \
    p73_34cd8f8..fix1107_70b11cf p73_70b11cf..fix1107_f0bf58c p73_f0bf58c..fix1107_dda348d; do
    i=$((i+1)); git bundle verify -q "$M/$n.bundle"; git fetch -q "$M/$n.bundle" "+refs/heads/*:refs/bk/b$i/*"
  done
  # 后出的增量（dda348d 之后 01 新推的 p73_dda348d..*.bundle 等）：按 当前状态.md 顶部段补 fetch 到 wip/fix1107
  git reset -q --hard 5824d10
  for x in feat/hunter-bow:2bed971 wip/wfix1105:097fc74 wip/dark40-3d:8a398cd wip/1105-night:7463543 \
    feat/elite-hd-1105:f18690e wip/map1106:f465119 wip/captain1106:23d3fc7 wip/fix1106:8147b02 \
    wip/ktx2-1106:1b36743 wip/fix1107:dda348d; do git branch -f "${x%%:*}" "${x##*:}"; done
  git for-each-ref --format='delete %(refname)' refs/bk | git update-ref --stdin
  git checkout -q wip/fix1107
  mkdir -p web/movie && cp "$R/02_工程包/03_宣发/CG制作/开场动画_v2/opening."{webm,mp4} web/movie/
  grep -q '^web/movie/' .git/info/exclude || echo 'web/movie/' >> .git/info/exclude
  npm ci && bash tools/setup_env.sh
  git log -1 --oneline; git log -1 --oneline master; fi
fi

if run showcase; then
  if [ -e $W/showcase ]; then echo "跳过 showcase：已存在"; else
  S=$R/02_工程包/02_展示区/工程bundle; cd $W/p73
  git fetch -q "$S/scene-showcase_012464e.bundle" scene-showcase:scene-showcase
  git fetch -q "$S/scene-showcase_012464e..5114eae.bundle" scene-showcase:scene-showcase
  git worktree add -q $W/showcase scene-showcase && git -C $W/showcase log -1 --oneline; fi   # 应为 5114eae
fi

if run raidA; then
  if [ -e $W/raidA/anyan ]; then echo "跳过 raidA：已存在"; else
  mkdir -p $W/raidA && git clone -q --shared $W/p73 $W/raidA/anyan
  cd $W/raidA/anyan && git branch -f raidA 2796afe && git checkout -q raidA && git log -1 --oneline; fi   # 2796afe 只存档
fi

if run ferry; then
  if [ -e $W/ferry ]; then echo "跳过 ferry：已存在"; else
  tar xzf "$R/02_工程包/01_开发/长副本raidA/中间件/raidA_ferry_中间件_20261102_0955.tar.gz" -C $W && ls $W/ferry | wc -l; fi   # 83 项
fi

if run chars; then
  if [ -e $W/chars ]; then echo "跳过 chars：已存在"; else
  C=$W/chars; mkdir -p $C
  x(){ mkdir -p "$2"; tar xzf "$C5/$1" -C "$2"; echo "ok $1"; }
  x 05线产物_1104/backup/chars_core_1104b.tgz $C
  x 收尾_1104_1425/chars_core_1104c.tgz $C
  x 收尾_1104_1610/chars_1104d_1610.tgz $C
  x 收尾_1104_2305/chars_1104e_2300.tgz $W            # 包内带 chars/ 前缀
  x 收尾_1105_0115/weapon40_1105_0110.tgz $W          # 带 chars/ 前缀
  x 1104_40级套装/1104_40级套装.tgz $C
  x 收尾_1105_0815/weapon40_rest3_1105_0815.tgz $C/weapon40
  x 收尾_1105_0815/wfix40_1105_0815.tgz $C
  x 1105_30级权重修正/wfix30_1105_1200.tgz $C
  x 收尾_1105_1350/chars_v1273_1105_1350.tgz $W       # 带 chars/ 前缀
  x 收尾_1105_1810/elite_v1273_1105_1810.tgz $W       # 带 chars/ 前缀
  x 1105_v1273精英绑骨/elite_v1273_bind_1105_1945.tgz $C
  x 1106_团长逐招/captain_moves_v1_1106.tgz $C        # → chars/capup/
  x 1106_贴图重绘/handoff_05to01_1106.tgz $C/handoff_05to01
  x 1106_贴图重绘/tools_gface_1106.tgz $C/tex1106
  x 1106_贴图重绘/2_身体脸部整套与无缝贴图/tools_body_tile_1106.tgz $C
  x 1107_面部重绘/face1107_中间件与工具.tgz $C/face1107
  mkdir -p $C/tex1106/整套_7c662c9 && cp -r "$C5/1106_贴图重绘/2_身体脸部整套与无缝贴图/角色整套_7c662c9/." $C/tex1106/整套_7c662c9/
  ln -sfn $W/p73/node_modules $C/node_modules
  (cd "$C5/1107_面部重绘" && md5sum -c md5.txt | grep -c OK)
  md5sum $C/tex1106/整套_7c662c9/*.glb $C/capup/dlc1_mirror_captain_moves.glb | cut -c1-8,34-; fi
fi
echo "完成：逐个 git log -1 与 01_交接 接手文件核对，不一致先停下回报 Rhett。"
