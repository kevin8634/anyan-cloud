#!/bin/bash
# 沙箱重置后恢复：chromium + arm64 依赖库（/tmp/libs）+ 中文字体 + openpyxl
cd "$(dirname "$0")/.."
# v1.2.86 持久缓存：/workspace/work/.envcache 不会被沙箱清理，先从这里恢复，装完再回写
C=/workspace/work/.envcache; mkdir -p $C ~/.cache ~/.fonts
CH=ms-playwright/chromium-1140/chrome-linux/chrome
[ -x ~/.cache/$CH ] || { [ -x $C/$CH ] && rm -rf ~/.cache/ms-playwright && cp -a $C/ms-playwright ~/.cache/; }
[ -d /tmp/libs ] || { [ -d $C/libs ] && cp -a $C/libs /tmp/; }
[ -f ~/.fonts/NotoSansSC-Regular.otf ] || { [ -d $C/fonts ] && cp -a $C/fonts/*.otf ~/.fonts/ && fc-cache -f >/dev/null 2>&1; }
[ -x ~/.cache/ms-playwright/chromium-1140/chrome-linux/chrome ] || node node_modules/playwright-core/cli.js install chromium >/dev/null 2>&1
if [ ! -d /tmp/libs/usr/lib/aarch64-linux-gnu ]; then
  mkdir -p /tmp/debs /tmp/libs && cd /tmp/debs && curl -s -o P.xz https://deb.debian.org/debian/dists/trixie/main/binary-arm64/Packages.xz
  python3 - <<'PY'
import lzma,re,subprocess
t=lzma.open('/tmp/debs/P.xz').read().decode()
want={'libatk1.0-0t64','libatk-bridge2.0-0t64','libatspi2.0-0t64','libxcomposite1','libxdamage1'}
for blk in t.split('\n\n'):
    m=re.search(r'^Package: (.+)$',blk,re.M)
    if m and m.group(1) in want:
        f=re.search(r'^Filename: (.+)$',blk,re.M).group(1)
        subprocess.run(['curl','-s','-o','/tmp/debs/'+f.split('/')[-1],'https://deb.debian.org/debian/'+f])
PY
  for d in /tmp/debs/*.deb; do dpkg -x $d /tmp/libs; done
fi
if [ ! -f ~/.fonts/NotoSansSC-Regular.otf ]; then mkdir -p ~/.fonts; for w in Regular Bold; do curl -sL -o ~/.fonts/NotoSansSC-$w.otf https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-$w.otf; done; fc-cache -f >/dev/null 2>&1; fi
mkdir -p $E; [ -d $E/ms-playwright ] || cp -a ~/.cache/ms-playwright $E/ 2>/dev/null; [ -d $E/libs ] || cp -a /tmp/libs $E/ 2>/dev/null; [ -d $E/.fonts ] || cp -a ~/.fonts $E/ 2>/dev/null
python3 -c "import openpyxl" 2>/dev/null || pip install -q openpyxl
[ -d $C/libs ] || cp -a /tmp/libs $C/; [ -x $C/$CH ] || { rm -rf $C/ms-playwright; cp -a ~/.cache/ms-playwright $C/; }; [ -d $C/fonts ] || { mkdir -p $C/fonts; cp -a ~/.fonts/NotoSansSC-*.otf $C/fonts/; }
mkdir -p /workspace/work/shots   # 截图一律输出到这里（/tmp 会被清）
echo "env ok; export LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu"
