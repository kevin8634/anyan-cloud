#!/bin/bash
# 11-07 生成 docs/攻略/潮渊钟井.html（raid_well 引 three / web，esbuild 打包后在 node 里补浏览器桩运行）
set -e; cd "$(dirname "$0")/../.."
node_modules/.bin/esbuild tools/guide/well_guide.ts --bundle --platform=node --format=cjs --outfile=/tmp/well_guide.js --log-level=error
node -e "
globalThis.window=globalThis; globalThis.self=globalThis; const el=()=>({getContext:()=>null,style:{},classList:{add(){},remove(){},toggle(){}},appendChild(){},addEventListener(){},setAttribute(){}});
globalThis.document={createElement:el,createElementNS:el,addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,body:el(),head:el(),documentElement:el()};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}}; try{globalThis.navigator={userAgent:''}}catch{}; globalThis.innerWidth=1;globalThis.innerHeight=1; globalThis.addEventListener=()=>{}; globalThis.requestAnimationFrame=()=>0;
require('/tmp/well_guide.js');"
# 宣发用长图（需 LD_LIBRARY_PATH=/tmp/libs/usr/lib/aarch64-linux-gnu）
node tools/guide/shot.mjs docs/攻略/潮渊钟井.html docs/攻略/攻略_潮渊钟井.png
