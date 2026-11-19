cd /workspace/work/electron1109 && cp /workspace/work/wellt/sample.ts ./wellt_tmp.ts && npx esbuild wellt_tmp.ts --bundle --format=iife --log-level=error --outfile=/workspace/work/wellt/b.js; rm -f wellt_tmp.ts
export PLAYWRIGHT_BROWSERS_PATH=/workspace/work/.envcache/ms-playwright LD_LIBRARY_PATH=/workspace/work/.envcache/libs/usr/lib/aarch64-linux-gnu; timeout 100 node /workspace/work/wellt/run.mjs && cd /workspace/work/wellt && python3 -c "
from PIL import Image
ims=[Image.open(f's{k}.png') for k in range(4)];W,H=ims[0].size;g=Image.new('RGB',(W*2,H*2))
for i,im in enumerate(ims): g.paste(im,((i%2)*W,(i//2)*H))
g.resize((W*5//4,H*5//4)).save('grid2.jpg',quality=85)"
