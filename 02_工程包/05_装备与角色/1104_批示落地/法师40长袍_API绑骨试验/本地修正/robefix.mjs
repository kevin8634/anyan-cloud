// 长袍裙摆本地权重修正：腿外的裙片去掉小腿/脚影响，改为骨盆主导+双大腿小比例，邻接平滑。0 分。
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
const [,, src, dst, P = '{}'] = process.argv; const cfg = { rLeg: 0.07, band: 0.03, wp: 0.6, wn: 0.3, wf: 0.1, smooth: 6, ...JSON.parse(P) };
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src); const root = doc.getRoot(); const skin = root.listSkins()[0]; const joints = skin.listJoints();
const name = joints.map(j => j.getName()); const ji = n => name.indexOf(n);
const ib = skin.getInverseBindMatrices().getArray();
const inv = m => { // 4x4 列主序求逆的平移：仅需世界位置 = -R^T t（刚体）
  const R = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]], t = [m[12], m[13], m[14]];
  return [-(R[0]*t[0]+R[1]*t[1]+R[2]*t[2]), -(R[3]*t[0]+R[4]*t[1]+R[5]*t[2]), -(R[6]*t[0]+R[7]*t[1]+R[8]*t[2])]; };
const jp = n => { const k = ji(n); return inv(Array.from(ib.slice(k*16, k*16+16))); };
const M='mixamorig:';const L = { th: jp(M+'LeftUpLeg'), ca: jp(M+'LeftLeg'), ft: jp(M+'LeftFoot') }, Rr = { th: jp(M+'RightUpLeg'), ca: jp(M+'RightLeg'), ft: jp(M+'RightFoot') };
const pel = ji(M+'Hips'), thl = ji(M+'LeftUpLeg'), thr = ji(M+'RightUpLeg');
const legSet = new Set(['LeftUpLeg','LeftLeg','LeftFoot','LeftToeBase','RightUpLeg','RightLeg','RightFoot','RightToeBase','Hips'].map(x=>ji(M+x)).filter(x => x >= 0));
const segd = (p, a, b) => { const ab = b.map((v,i)=>v-a[i]), ap = p.map((v,i)=>v-a[i]); const t = Math.max(0, Math.min(1, (ap[0]*ab[0]+ap[1]*ab[1]+ap[2]*ab[2]) / (ab[0]**2+ab[1]**2+ab[2]**2))); return Math.hypot(...ap.map((v,i)=>v-t*ab[i])); };
const legd = (p, S) => Math.min(segd(p, S.th, S.ca), segd(p, S.ca, S.ft));
const cy = (L.th[1] + Rr.th[1]) / 2;
let changed = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION').getArray(), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
  const ja = J.getArray(), wa = W.getArray(), n = pos.length / 3, wn = W.getNormalized() || wa instanceof Uint8Array ? 255 : 1;
  const dense = new Float32Array(n * joints.length);
  for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) dense[v*joints.length + ja[v*4+k]] += wa[v*4+k] / (wn === 255 && !(wa instanceof Float32Array) ? 255 : 1);
  const alpha = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const p = [pos[v*3], pos[v*3+1], pos[v*3+2]]; if (p[1] > cy + 0.02) continue;
    { let keep=0; for (const j of legSet) keep += dense[v*joints.length + j]; if (keep > 1e-6 && keep < 0.999) { for (let j = 0; j < joints.length; j++) dense[v*joints.length + j] = legSet.has(j) ? dense[v*joints.length + j] / keep : 0; alpha[v] = Math.max(alpha[v], 0.01); } }
    const dl = legd(p, L), dr = legd(p, Rr), d = Math.min(dl, dr);
    const a = Math.max(0, Math.min(1, (d - cfg.rLeg) / cfg.band)) * Math.max(0, Math.min(1, (cy + 0.02 - p[1]) / 0.06));
    if (a <= 0) continue; alpha[v] = a;
    const near = dl < dr ? thl : thr, far = dl < dr ? thr : thl; const tgt = new Float32Array(joints.length);
    tgt[pel] = cfg.wp; tgt[near] += cfg.wn; tgt[far] += cfg.wf;
    for (let j = 0; j < joints.length; j++) dense[v*joints.length + j] = (1-a) * dense[v*joints.length + j] + a * tgt[j];
    changed++;
  }
  // 邻接平滑（只动 alpha>0 的点）
  const idx = prim.getIndices().getArray(); const nb = Array.from({ length: n }, () => new Set());
  for (let f = 0; f < idx.length; f += 3) { const [a,b,c] = [idx[f],idx[f+1],idx[f+2]]; nb[a].add(b).add(c); nb[b].add(a).add(c); nb[c].add(a).add(b); }
  // 位置焊接：同位置点视为邻居（UV 缝）
  const key = v => `${pos[v*3].toFixed(5)},${pos[v*3+1].toFixed(5)},${pos[v*3+2].toFixed(5)}`; const grp = new Map();
  for (let v = 0; v < n; v++) { const k = key(v); if (!grp.has(k)) grp.set(k, []); grp.get(k).push(v); }
  for (const g of grp.values()) if (g.length > 1) for (const a of g) for (const b of g) if (a !== b) nb[a].add(b);
  for (let it = 0; it < cfg.smooth; it++) { const nd = dense.slice(); for (let v = 0; v < n; v++) { if (!alpha[v]) continue; const s = [...nb[v]]; for (let j = 0; j < joints.length; j++) { let acc = dense[v*joints.length+j]; for (const u of s) acc += dense[u*joints.length+j]; nd[v*joints.length+j] = acc / (s.length + 1); } } dense.set(nd); }
  for (const g of grp.values()) if (g.length > 1) { for (let j = 0; j < joints.length; j++) { let m = 0; for (const v of g) m += dense[v*joints.length+j]; m /= g.length; for (const v of g) dense[v*joints.length+j] = m; } }
  // 回写 top4，量化和 = 255
  for (let v = 0; v < n; v++) { const row = Array.from(dense.slice(v*joints.length, (v+1)*joints.length)).map((w,j)=>[w,j]).sort((a,b)=>b[0]-a[0]).slice(0,4); const s = row.reduce((t,r)=>t+r[0],0);
    if (wa instanceof Float32Array) row.forEach((r,k)=>{ ja[v*4+k]=r[1]; wa[v*4+k]=r[0]/s; });
    else { let q = row.map(r=>Math.round(r[0]/s*255)); q[0] += 255 - q.reduce((a,b)=>a+b,0); row.forEach((r,k)=>{ ja[v*4+k]=r[1]; wa[v*4+k]=q[k]; }); } }
  J.setArray(ja); W.setArray(wa);
}
await io.write(dst, doc); console.log('changed', changed, 'cy', cy.toFixed(3), JSON.stringify(cfg));
