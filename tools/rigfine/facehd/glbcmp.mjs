// raidA 11-03：两个蒙皮 glb 对比（骨骼表 / 逆绑定矩阵 / 动画通道与关键帧 / 按位置匹配的顶点权重）。node tools/rigfine/facehd/glbcmp.mjs 旧.glb 新.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
async function L(p){ const d=await io.read(p); await d.transform(dequantize()); const r=d.getRoot(); const n=r.listNodes().find(n=>n.getSkin()); const sk=n.getSkin();
  const J=sk.listJoints().map(j=>j.getName()); const ibm=Array.from(sk.getInverseBindMatrices().getArray());
  const m=new Map(); for(const q of n.getMesh().listPrimitives()){ const P=q.getAttribute('POSITION'),Jo=q.getAttribute('JOINTS_0'),Wt=q.getAttribute('WEIGHTS_0'); const a=[],b=[],c=[];
    for(let i=0;i<P.getCount();i++){P.getElement(i,a);Jo.getElement(i,b);Wt.getElement(i,c); const w=new Array(J.length).fill(0); for(let k=0;k<4;k++) w[b[k]]+=c[k]; m.set(a.map(x=>x.toFixed(3)).join(','),w);} }
  return {J,ibm,m,anim:r.listAnimations().map(a=>a.getName()+":"+a.listChannels().length)}; }
const A=await L(process.argv[2]), B=await L(process.argv[3]);
console.log('joints same', JSON.stringify(A.J)===JSON.stringify(B.J), A.J.length, 'ibm maxdiff', Math.max(...A.ibm.map((v,i)=>Math.abs(v-B.ibm[i]))));
console.log('anims', JSON.stringify(A.anim)===JSON.stringify(B.anim), A.anim.join(' '));
var big; let n=0,miss=0,mx=0,sum=0; for(const [k,w] of A.m){ const v=B.m.get(k); if(!v){miss++;continue;} let d=0; for(let i=0;i<w.length;i++) d=Math.max(d,Math.abs(w[i]-v[i])); mx=Math.max(mx,d); sum+=d; n++; if(d>0.05){big=(typeof big==="undefined"?0:big)+1; if(big<6) console.log(k,d.toFixed(3));} }
console.log("big>0.05", typeof big==="undefined"?0:big);
console.log('verts', A.m.size, B.m.size, 'matched', n, 'miss', miss, 'weight maxdiff', mx.toFixed(4), 'mean', (sum/n).toFixed(5));
{ const r=async p=>{const d=await io.read(p); await d.transform(dequantize()); return d.getRoot().listAnimations().map(a=>a.listChannels().map(c=>{const s=c.getSampler(); return [c.getTargetNode().getName(),c.getTargetPath(),Array.from(s.getInput().getArray()),Array.from(s.getOutput().getArray())]}))};
  const x=await r(process.argv[2]), y=await r(process.argv[3]); let md=0, same=x.length===y.length;
  x.forEach((a,i)=>a.forEach((c,j)=>{const e=y[i][j]; if(!e||c[0]!==e[0]||c[1]!==e[1]||c[2].length!==e[2].length){same=false;return;} c[3].forEach((v,k)=>md=Math.max(md,Math.abs(v-e[3][k])));}));
  console.log('anim structure same', same, 'n', x.length, 'keyframe maxdiff', md); }
