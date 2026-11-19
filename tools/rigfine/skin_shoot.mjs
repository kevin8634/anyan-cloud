import { chromium } from '/workspace/projects/05bff4bf-a78d-4962-9eec-1218dd871bdc/dev/main/node_modules/playwright-core/index.mjs';
import {mkdirSync} from 'fs';const O='/tmp/skf';mkdirSync(O,{recursive:true});
const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:480,height:480}});
await p.goto('http://127.0.0.1:8765/skin.html');await p.waitForFunction(()=>window.ready,null,{timeout:120000});
const L=(a,b,t)=>a+(b-a)*t, ease=t=>t*t*(3-2*t);
function P(k){ // k: dict of named params
 return {LeftArm:[0,0,-k.la],RightArm:[0,k.rf,k.ra],LeftForeArm:[0,0,-k.lf],RightForeArm:[0,-k.rfa,0],Spine:[k.bend,k.tw,0],Spine1:[k.bend*0.5,k.tw*0.5,0],Head:[k.hd,0,0],
  LeftUpLeg:[-k.kn,0,0],LeftLeg:[k.kn*1.8,0,0],RightUpLeg:[-k.kn,0,0],RightLeg:[k.kn*1.8,0,0]};}
const Z={la:0,ra:0,rf:0,lf:0,rfa:0,bend:0,tw:0,hd:0,kn:0};
const idle={...Z,la:1.2,ra:1.0,lf:0.2,rfa:0.3};
const raise={...Z,la:-0.9,ra:-0.9,hd:-0.3,bend:-0.15};
const wind={...idle,tw:0.7,ra:0.4,rf:-0.6,bend:0.1};
const swing={...idle,tw:-0.8,ra:0.5,rf:0.9,bend:0.15};
const dead={...idle,bend:0.9,hd:0.4,kn:0.7,la:1.4,ra:1.3};
const seq=[[Z,idle,8],[idle,idle,6],[idle,wind,6],[wind,swing,4],[swing,idle,6],[idle,raise,8],[raise,raise,4],[raise,idle,6],[idle,dead,10],[dead,dead,6]];
let f=0;for(const [a,c,n] of seq)for(let i=0;i<n;i++){const t=ease(i/(n-1||1));const k={};for(const x in Z)k[x]=L(a[x],c[x],t);
 if(a===c&&a===idle)k.bend=0.03*Math.sin(i);await p.evaluate(v=>window.pose(v),P(k));await p.screenshot({path:`${O}/f${String(f++).padStart(3,'0')}.png`});}
console.log('frames',f);await b.close();
