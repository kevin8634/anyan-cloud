#!/bin/bash
# 串行跑浏览器任务：每个任务开始前等其他 chromium 结束（两个 chromium 同时跑会 OOM）
cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu
# 空闲后再随机等 1–3 秒复查一次：避免两个代理同一秒同时起 chromium
waitfree() { while :; do while pgrep -f "chrome-linux/chrome" >/dev/null; do sleep 1; done; sleep $((RANDOM % 3 + 1)); pgrep -f "chrome-linux/chrome" >/dev/null || break; done; }
for job in "$@"; do waitfree; echo "== $job $(date -u +%T)"; eval "$job"; done
echo "== done $(date -u +%T)"
