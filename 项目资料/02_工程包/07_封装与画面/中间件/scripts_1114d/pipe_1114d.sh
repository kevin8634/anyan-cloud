set -e
# 1114d 打包（pipe_1114c.sh 缺失，按 pipe_1114b2.sh 重建；直接用 electron1109 已构建的 web/desktop）
cd /workspace/work/electron_pkg/dl
[ -f electron-v45.2.3-win32-x64.zip ] || curl -sSLO https://github.com/electron/electron/releases/download/v45.2.3/electron-v45.2.3-win32-x64.zip
[ -f SHASUMS256.txt ] || curl -sSLO https://github.com/electron/electron/releases/download/v45.2.3/SHASUMS256.txt
sha256sum -c --ignore-missing SHASUMS256.txt
cd /workspace/work/electron1109
rm -rf desktop/out/DarkRock-win-x64 desktop/out/DarkRock-win-x64.zip
node desktop/electron/pack-win.mjs --html=web/desktop/index.html > /workspace/work/electron_pkg/pack_1114d.log 2>&1
tail -3 /workspace/work/electron_pkg/pack_1114d.log
cd desktop/out && zip -qr -1 DarkRock-win-x64_1114d.zip DarkRock-win-x64 && ls -la DarkRock-win-x64_1114d.zip
echo ZIPPED
