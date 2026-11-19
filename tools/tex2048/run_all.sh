# 六职业依次超分（每个约 6–10 分钟），日志 /workspace/work/tex2048/log.txt；已有输出的跳过（沙箱重置后可续跑）
cd /workspace/work/p73
for c in "$@"; do [ -f /workspace/work/tex2048/${c}_bc2048.png ] && continue; PYTHONPATH=/workspace/work/pylib python3 tools/tex2048/esrgan.py $c 128 >> /workspace/work/tex2048/log.txt 2>&1; done
