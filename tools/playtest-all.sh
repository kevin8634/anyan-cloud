#!/usr/bin/env bash
# v1.2.9：两套构建全量 playtest（本体 + DLC），已有日志的跳过（可分批续跑）；结果 ${PT_DIR:-/workspace/work/pt_all}/summary.txt
# 用法：bash tools/playtest-all.sh [并行数=4] [本批最多几个=999]   （先 build-web 两套；重跑全部先 rm -rf ${PT_DIR:-/workspace/work/pt_all}）
J=${1:-4}; MAX=${2:-999}; export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
mkdir -p ${PT_DIR:-/workspace/work/pt_all}
MODES=$(grep -o "MODE === '[a-z0-9_]*'" test/playtest.mjs | sed "s/MODE === '//;s/'//" | sort -u | grep -vx all)   # all = 全部模式串一遍，单独跑
run() { local b=$1 m=$2; if [ "$b" = dlc ]; then PLAYTEST_DLC=dlc1 timeout 900 node test/playtest.mjs $m > ${PT_DIR:-/workspace/work/pt_all}/${b}_$m.tmp 2>&1; else timeout 900 node test/playtest.mjs $m > ${PT_DIR:-/workspace/work/pt_all}/${b}_$m.tmp 2>&1; fi; mv ${PT_DIR:-/workspace/work/pt_all}/${b}_$m.tmp ${PT_DIR:-/workspace/work/pt_all}/${b}_$m.log; }
export -f run
for b in base dlc; do for m in $MODES; do [ -f ${PT_DIR:-/workspace/work/pt_all}/${b}_$m.log ] || echo "$b $m"; done; done | head -n $MAX | xargs -P $J -n 2 bash -c 'run "$0" "$1"'
: > ${PT_DIR:-/workspace/work/pt_all}/summary.txt
for f in ${PT_DIR:-/workspace/work/pt_all}/*.log; do n=$(basename $f .log); if grep -q "✅ 全部通过" $f; then echo "OK $n" >> ${PT_DIR:-/workspace/work/pt_all}/summary.txt; else echo "FAIL $n :: $(grep -E '✗|Error|❌' $f | head -3 | tr '\n' ' ' | cut -c1-300)" >> ${PT_DIR:-/workspace/work/pt_all}/summary.txt; fi; done
echo "OK $(grep -c ^OK ${PT_DIR:-/workspace/work/pt_all}/summary.txt) / FAIL $(grep -c ^FAIL ${PT_DIR:-/workspace/work/pt_all}/summary.txt) / 总 $(( $(echo "$MODES" | wc -l) * 2 ))"
