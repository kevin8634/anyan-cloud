import { chromium } from '/workspace/projects/05bff4bf-a78d-4962-9eec-1218dd871bdc/dev/main/node_modules/playwright-core/index.mjs';
import {mkdirSync} from 'fs';import {CLIPS} from './clips9.mjs';
const only=process.argv[2];
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:480,height:480}});p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto('http://127.0.0.1:8765/skin.html');await p.waitForFunction(()=>window.ready,null,{timeout:120000});
const ease=t=>t*t*(3-2*t);
function at(k,t){let i=0;while(i<k.length-2&&t>k[i+1][0])i++;const [t0,a]=k[i],[t1,c]=k[i+1];const u=ease(Math.min(1,Math.max(0,(t-t0)/(t1-t0))));
 const o={};for(const n of new Set([...Object.keys(a),...Object.keys(c)])){const va=a[n]??(n=='_hy'||n=='_pg'?0:[0,0,0]),vc=c[n]??(n=='_hy'||n=='_pg'?0:[0,0,0]);
 o[n]=Array.isArray(va)?va.map((x,j)=>x+(vc[j]-x)*u):va+(vc-va)*u;}return o;}
for(const [id,c] of Object.entries(CLIPS)){if(only&&id!=only)continue;const D=`/tmp/c9/${id}`;mkdirSync(D,{recursive:true});const dur=c.k.at(-1)[0];let f=0;
 for(let t=0;t<=dur+0.31;t+=0.1){await p.evaluate(v=>window.pose(v),at(c.k,Math.min(t,dur)));await p.screenshot({path:`${D}/f${String(f++).padStart(3,'0')}.png`});}
 console.log(id,f);}
await b.close();
