#!/bin/bash
# A10：评委 zip 体积估算（比赛版 DLC html + raid/ + music/，不含 exe / 文档）：bash tools/judge-zip-size.sh
cd "$(dirname "$0")/../web" || exit 1
rm -f /tmp/judge_est.zip; zip -q -r /tmp/judge_est.zip index_dlc1_比赛版.html raid music
ls -l index_dlc1_比赛版.html /tmp/judge_est.zip | awk '{printf "%s %.1f MB (%.1f MiB)\n", $9, $5/1e6, $5/1048576}'
du -sb raid music | awk '{printf "%s %.1f MB\n", $2, $1/1e6}'
