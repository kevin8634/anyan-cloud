set -e
# 1118 打包：直接用 pack1118（wip/pack1118 1c1b4b2）已 KTX2 build 的 web/desktop
cd /workspace/work/electron_pkg/dl
sha256sum -c --ignore-missing SHASUMS256.txt
cd /workspace/work/pack1118
rm -rf desktop/out/DarkRock-win-x64 desktop/out/DarkRock-win-x64_1118.zip
node desktop/electron/pack-win.mjs --html=web/desktop/index.html > /workspace/work/electron_pkg/pack_1118.log 2>&1
tail -3 /workspace/work/electron_pkg/pack_1118.log
cd desktop/out && zip -qr -1 DarkRock-win-x64_1118.zip DarkRock-win-x64 && ls -la DarkRock-win-x64_1118.zip
echo ZIPPED
