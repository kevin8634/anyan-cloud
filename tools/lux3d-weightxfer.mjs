// raidA 11-01：权重转移。Lux3D 绑骨件（约 1.5 万面，带 mixamo 骨骼 + 蒙皮）→ 高面数显示件（4 万面 2048 贴图，同一原始模型减面得来）。
// 做法：显示件每个顶点找绑骨件上最近的三角形（网格加速），按重心坐标插值骨权重，取前 4 根归一化。
// 骨骼、skin、节点层级沿用绑骨件；几何（位置/法线/UV/索引）和贴图换成显示件。两件坐标系不同时按包围盒对齐（等比缩放 + 平移）。
// 用法：node tools/lux3d-weightxfer.mjs 绑骨件.glb 显示件.glb 输出.glb [--tex 2048]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune, meshopt, textureCompress, copyToDocument } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
const [rigPath, dispPath, outPath] = process.argv.slice(2);
const TEX = Number(process.argv[process.argv.indexOf('--tex') + 1]) || 2048;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const rig = await io.read(rigPath), disp = await io.read(dispPath);
await rig.transform(dequantize()); await disp.transform(dequantize());
for (const e of disp.getRoot().listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();
for (const e of rig.getRoot().listExtensionsUsed()) if (/meshopt|quantiz/i.test(e.extensionName)) e.dispose();

const rNode = rig.getRoot().listNodes().find(n => n.getMesh() && n.getSkin());
if (!rNode) throw new Error('绑骨件里没有带 skin 的网格');
const rPrims = rNode.getMesh().listPrimitives();
if (rPrims.length !== 1) console.warn('绑骨件有', rPrims.length, '个 primitive，只用第一个做权重源');
const rp = rPrims[0];
const arr = (acc) => { const n = acc.getCount(), k = acc.getElementSize(), o = new Float64Array(n * k), el = []; for (let i = 0; i < n; i++) { acc.getElement(i, el); for (let j = 0; j < k; j++) o[i * k + j] = el[j]; } return o; };
const RP = arr(rp.getAttribute('POSITION')), RJ = arr(rp.getAttribute('JOINTS_0')), RW = arr(rp.getAttribute('WEIGHTS_0'));
const RI = Array.from(rp.getIndices().getArray());
const nR = RP.length / 3;

// 显示件：所有 primitive（11-01 起支持多材质，如首领脸部独立贴图 MI_GordonFace）合在世界坐标算对齐
const dNode = disp.getRoot().listNodes().find(n => n.getMesh());
const dps = dNode.getMesh().listPrimitives();
const DM = dNode.getWorldMatrix();
const toWorld = (P0) => { const o = new Float64Array(P0.length); for (let i = 0; i < P0.length / 3; i++) { const x = P0[i*3], y = P0[i*3+1], z = P0[i*3+2]; for (let r = 0; r < 3; r++) o[i*3+r] = DM[r]*x + DM[4+r]*y + DM[8+r]*z + DM[12+r]; } return o; };
const DPs = dps.map(q => toWorld(arr(q.getAttribute('POSITION'))));
const DP = new Float64Array(DPs.reduce((s, a) => s + a.length, 0)); { let o = 0; for (const a of DPs) { DP.set(a, o); o += a.length; } }
const nD = DP.length / 3;
const bbox = (P) => { const mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; for (let i = 0; i < P.length; i += 3) for (let r = 0; r < 3; r++) { mn[r] = Math.min(mn[r], P[i+r]); mx[r] = Math.max(mx[r], P[i+r]); } return { mn, mx, sz: mx.map((v, r) => v - mn[r]), c: mx.map((v, r) => (v + mn[r]) / 2) }; };
const bR = bbox(RP), bD = bbox(DP);
// 等比缩放按三轴尺寸比的中位数；轴向必须一致（检查各轴比例偏差）
const ratios = [0,1,2].map(r => bR.sz[r] / bD.sz[r]); const s = [...ratios].sort((a,b)=>a-b)[1];
console.log('绑骨件 bbox', bR.sz.map(v=>v.toFixed(3)), '显示件 bbox', bD.sz.map(v=>v.toFixed(3)), '比例', ratios.map(v=>v.toFixed(4)));
if (ratios.some(v => Math.abs(v / s - 1) > 0.06)) throw new Error('两件轴向/比例不一致，需人工检查坐标系');
const XP = new Float64Array(DP.length);   // 显示件对齐到绑骨件网格局部坐标
for (let i = 0; i < nD; i++) for (let r = 0; r < 3; r++) XP[i*3+r] = (DP[i*3+r] - bD.c[r]) * s + bR.c[r];

// 网格加速：按三角形包围盒入格
const H = Math.max(...bR.sz), cell = H / 64;
const key = (x,y,z) => `${Math.floor((x-bR.mn[0])/cell)},${Math.floor((y-bR.mn[1])/cell)},${Math.floor((z-bR.mn[2])/cell)}`;
const grid = new Map();
const nT = RI.length / 3;
for (let t = 0; t < nT; t++) {
  const v = [RI[t*3], RI[t*3+1], RI[t*3+2]];
  const lo = [0,1,2].map(r => Math.min(...v.map(k => RP[k*3+r]))), hi = [0,1,2].map(r => Math.max(...v.map(k => RP[k*3+r])));
  const a = lo.map((x,r) => Math.floor((x - bR.mn[r]) / cell)), b = hi.map((x,r) => Math.floor((x - bR.mn[r]) / cell));
  for (let i = a[0]; i <= b[0]; i++) for (let j = a[1]; j <= b[1]; j++) for (let k = a[2]; k <= b[2]; k++) { const kk = `${i},${j},${k}`; let l = grid.get(kk); if (!l) grid.set(kk, l = []); l.push(t); }
}
// 点到三角形最近点（Ericson），返回 [d2, u, v, w]
function closest(p, a, b, c) {
  const sub = (x,y)=>[x[0]-y[0],x[1]-y[1],x[2]-y[2]], dot=(x,y)=>x[0]*y[0]+x[1]*y[1]+x[2]*y[2];
  const ab=sub(b,a), ac=sub(c,a), ap=sub(p,a); const d1=dot(ab,ap), d2=dot(ac,ap);
  let u,v,w;
  if (d1<=0&&d2<=0) { u=1;v=0;w=0; } else {
    const bp=sub(p,b), d3=dot(ab,bp), d4=dot(ac,bp);
    if (d3>=0&&d4<=d3) { u=0;v=1;w=0; } else {
      const vc=d1*d4-d3*d2;
      if (vc<=0&&d1>=0&&d3<=0) { const t=d1/(d1-d3); u=1-t;v=t;w=0; } else {
        const cp=sub(p,c), d5=dot(ab,cp), d6=dot(ac,cp);
        if (d6>=0&&d5<=d6) { u=0;v=0;w=1; } else {
          const vb=d5*d2-d1*d6;
          if (vb<=0&&d2>=0&&d6<=0) { const t=d2/(d2-d6); u=1-t;v=0;w=t; } else {
            const va=d3*d6-d5*d4;
            if (va<=0&&(d4-d3)>=0&&(d5-d6)>=0) { const t=(d4-d3)/((d4-d3)+(d5-d6)); u=0;v=1-t;w=t; } else {
              const den=1/(va+vb+vc); v=vb*den; w=vc*den; u=1-v-w; } } } } } }
  const q=[a[0]*u+b[0]*v+c[0]*w,a[1]*u+b[1]*v+c[1]*w,a[2]*u+b[2]*v+c[2]*w]; const d=sub(p,q);
  return [dot(d,d),u,v,w];
}
const NJ = new Uint16Array(nD*4), NW = new Float32Array(nD*4);
let maxD = 0, sumD = 0;
for (let i = 0; i < nD; i++) {
  const p = [XP[i*3], XP[i*3+1], XP[i*3+2]];
  const ci = [0,1,2].map(r => Math.floor((p[r] - bR.mn[r]) / cell));
  let best = null;
  for (let rad = 0; rad <= 8 && !best; rad++) {   // 逐圈扩大，找到就再多看一圈保证最近
    const cand = new Set();
    for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) for (let c = -rad; c <= rad; c++) { const l = grid.get(`${ci[0]+a},${ci[1]+b},${ci[2]+c}`); if (l) for (const t of l) cand.add(t); }
    if (!cand.size) continue;
    for (const t of cand) { const A=RI[t*3],B=RI[t*3+1],C=RI[t*3+2]; const r = closest(p,[RP[A*3],RP[A*3+1],RP[A*3+2]],[RP[B*3],RP[B*3+1],RP[B*3+2]],[RP[C*3],RP[C*3+1],RP[C*3+2]]); if (!best || r[0] < best[0]) best = [...r, A, B, C]; }
  }
  if (!best) throw new Error('顶点 ' + i + ' 找不到近邻三角形');
  const acc = new Map();
  [[best[4],best[1]],[best[5],best[2]],[best[6],best[3]]].forEach(([vk, bw]) => { for (let j = 0; j < 4; j++) { const wt = RW[vk*4+j]*bw; if (wt > 0) acc.set(RJ[vk*4+j], (acc.get(RJ[vk*4+j])||0) + wt); } });
  const top = [...acc.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4); const tot = top.reduce((s,x)=>s+x[1],0) || 1;
  top.forEach(([j,w],k) => { NJ[i*4+k] = j; NW[i*4+k] = w/tot; });
  const d = Math.sqrt(best[0]); maxD = Math.max(maxD, d); sumD += d;
}
console.log(`显示件 ${nD} 顶点 → 最近三角距离 平均 ${(sumD/nD/H*100).toFixed(3)}% 身高，最大 ${(maxD/H*100).toFixed(2)}% 身高`);

// 把显示件的 primitive（几何 + 材质贴图）拷进绑骨文档，挂到原 skinned 网格上替换旧 primitive（拼接数组按 primitive 拆回）
const map = copyToDocument(rig, disp, dps);
const buf = rig.getRoot().listBuffers()[0];
const mesh = rNode.getMesh();
for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
let off = 0, tris = 0; const nps = [];
for (const dq of dps) {
  const np = map.get(dq), n = DPs[dps.indexOf(dq)].length / 3;
  np.setAttribute('POSITION', rig.createAccessor().setType('VEC3').setArray(new Float32Array(XP.subarray(off*3, (off+n)*3))).setBuffer(buf));
  np.setAttribute('JOINTS_0', rig.createAccessor().setType('VEC4').setArray(NJ.slice(off*4, (off+n)*4)).setBuffer(buf));
  np.setAttribute('WEIGHTS_0', rig.createAccessor().setType('VEC4').setArray(NW.slice(off*4, (off+n)*4)).setBuffer(buf));
  mesh.addPrimitive(np); nps.push(np); off += n; tris += np.getIndices().getCount() / 3;
}
// 合并成单个 buffer（GLB 只允许一个）；清掉绑骨件旧材质贴图
for (const a of rig.getRoot().listAccessors()) a.setBuffer(buf);
for (const b of rig.getRoot().listBuffers()) if (b !== buf) b.dispose();
const MRTEX = Number(process.env.MRTEX || 0);   // 可选：金属粗糙度贴图单独缩到此尺寸（如 1024）
const mrSlots = /metallicRoughness/;
await rig.transform(prune(), ...(MRTEX ? [textureCompress({ encoder: sharp, targetFormat: 'webp', slots: mrSlots, resize: [MRTEX, MRTEX], quality: 86 })] : []), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(outPath, rig);
console.log(`✓ ${outPath}  ${Math.round(tris)} 面（${nps.length} 个 primitive）  骨骼 ${rNode.getSkin().listJoints().length} 根  ${(await import('fs')).statSync(outPath).size/1024|0} KB`);
