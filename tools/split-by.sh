#!/bin/bash
# 用法：split-by.sh "<起始标题片段>" "<结束标题片段（不含）>" 模块名 bind名 "注释"
f=src/web/main.ts
a=$(grep -n -F -x -- "$1" $f | head -1 | cut -d: -f1); [ -z "$a" ] && a=$(grep -n -F -- "$1" $f | head -1 | cut -d: -f1)
b=$(grep -n -F -x -- "$2" $f | head -1 | cut -d: -f1); [ -z "$b" ] && b=$(grep -n -F -- "$2" $f | head -1 | cut -d: -f1)
[ -z "$a" ] || [ -z "$b" ] && { echo "header not found: $1 / $2"; exit 1; }
# 结束标题前若是 // ===== 分隔块，往上退到分隔块开头
b=$((b-1)); while sed -n "${b}p" $f | grep -q '^// =====\|^$'; do b=$((b-1)); done
node tools/split-main.cjs $a $b "$3" "$4" "$5"
