// raidA 11-01：区域加权压面（零积分）。原始件（约 29 万面）→ 显示件：Head/Neck 骨影响区保留更多面，其余身体压得更狠。
// 头部区域 = 原始件顶点按包围盒对齐到绑骨件后，取最近绑骨件顶点的 Head+Neck 权重；三角形任一顶点 ≥ 阈值即归头部。
// 两块分别用 meshopt simplifyWithAttributes（法线+UV 参与误差；不加 Permissive，UV 接缝保留），LockBorder 锁住两块交界 → 无裂缝。
// 产出不带蒙皮的显示件（原材质/贴图），再交给 lux3d-weightxfer.mjs 转权重。
// 用法：node tools/rigfine/gordon_regionsimp.mjs 原始件.glb 绑骨件.glb 输出.glb [--head 11000] [--body 33500] [--thr 0.25]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { MeshoptSimplifier as S } from 'meshoptimizer-next';
const [rawPath, rigPath, outPath] = process.argv.slice(2);
const opt = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const HEAD = opt('head', 11000), BODY = opt('body', 33500), THR = opt('thr', 0.25);
await MeshoptDecoder.ready; await S.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const raw = await io.read(rawPath), rig = await io.read(rigPath);
await rig.transform(dequantize());
const f32 = (acc) => { const n = acc.getCount(), k = acc.getElementSize(), o = new Float32Array(n * k), el = []; for (let i = 0; i < n; i++) { acc.getElement(i, el); for (let j = 0; j < k; j++) o[i * k + j] = el[j]; } return o; };
const rp = raw.getRoot().listMeshes()[0].listPrimitives()[0];
const P = f32(rp.getAttribute('POSITION')), N = f32(rp.getAttribute('NORMAL')), UV = f32(rp.getAttribute('TEXCOORD_0'));
const I = new Uint32Array(rp.getIndices().getArray()); const nV = P.length / 3, nT = I.length / 3;
const rNode = rig.getRoot().listNodes().find(n => n.getMesh() && n.getSkin());
const gp = rNode.getMesh().listPrimitives()[0];
const GP = f32(gp.getAttribute('POSITION')), GJ = f32(gp.getAttribute('JOINTS_0')), GW = f32(gp.getAttribute('WEIGHTS_0'));
const names = rNode.getSkin().listJoints().map(j => j.getName());
const headJ = new Set(names.map((n, i) => /Head|Neck/.test(n) ? i : -1).filter(i => i >= 0));
const nG = GP.length / 3, GH = new Float32Array(nG);
for (let i = 0; i < nG; i++) for (let j = 0; j < 4; j++) if (headJ.has(GJ[i * 4 + j])) GH[i] += GW[i * 4 + j];
const bbox = (A) => { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < A.length; i += 3) for (let r = 0; r < 3; r++) { mn[r] = Math.min(mn[r], A[i + r]); mx[r] = Math.max(mx[r], A[i + r]); } return { mn, mx, sz: mx.map((v, r) => v - mn[r]), c: mx.map((v, r) => (v + mn[r]) / 2) }; };
const bG = bbox(GP), bR = bbox(P); const s = [0, 1, 2].map(r => bG.sz[r] / bR.sz[r]).sort((a, b) => a - b)[1];
// 网格最近点（绑骨件顶点入格）
const H = Math.max(...bG.sz), cell = H / 80, grid = new Map(), ck = (x, y, z) => x + ',' + y + ',' + z;
const cix = (v, r) => Math.floor((v - bG.mn[r]) / cell);
for (let i = 0; i < nG; i++) { const k = ck(cix(GP[i * 3], 0), cix(GP[i * 3 + 1], 1), cix(GP[i * 3 + 2], 2)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); }
const VH = new Float32Array(nV);
for (let i = 0; i < nV; i++) {
  const p = [0, 1, 2].map(r => (P[i * 3 + r] - bR.c[r]) * s + bG.c[r]); const c = p.map((v, r) => cix(v, r));
  let best = -1, bd = 1e18;
  for (let rad = 0; rad <= 6 && (best < 0 || rad <= 1); rad++) for (let a = -rad; a <= rad; a++) for (let b = -rad; b <= rad; b++) for (let d = -rad; d <= rad; d++) {
    if (Math.max(Math.abs(a), Math.abs(b), Math.abs(d)) !== rad) continue; const l = grid.get(ck(c[0] + a, c[1] + b, c[2] + d)); if (!l) continue;
    for (const g of l) { const dx = GP[g * 3] - p[0], dy = GP[g * 3 + 1] - p[1], dz = GP[g * 3 + 2] - p[2], dd = dx * dx + dy * dy + dz * dz; if (dd < bd) { bd = dd; best = g; } }
  }
  VH[i] = best >= 0 ? GH[best] : 0;
}
// 位置相同的顶点（UV 接缝两侧）取最大值，避免接缝处归属不一致
const remap = S.generatePositionRemap(P, 3); for (let i = 0; i < nV; i++) { const r = remap[i]; if (VH[i] > VH[r]) VH[r] = VH[i]; } for (let i = 0; i < nV; i++) VH[i] = VH[remap[i]];
const hi = [], bi = [];
for (let t = 0; t < nT; t++) { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2]; (Math.max(VH[a], VH[b], VH[c]) >= THR ? hi : bi).push(a, b, c); }
console.log(`原始 ${nT} 面 → 头部区 ${hi.length / 3} 面，身体区 ${bi.length / 3} 面`);
const ATTR = new Float32Array(nV * 5); for (let i = 0; i < nV; i++) { ATTR.set(N.subarray(i * 3, i * 3 + 3), i * 5); ATTR[i * 5 + 3] = UV[i * 2]; ATTR[i * 5 + 4] = UV[i * 2 + 1]; }
const W = [0.4, 0.4, 0.4, 1.5, 1.5];
const simp = (idx, target) => { const [o, err] = S.simplifyWithAttributes(new Uint32Array(idx), P, 3, ATTR, 5, W, null, target * 3, 1, ['LockBorder']); console.log(`  ${idx.length / 3} → ${o.length / 3} 面（误差 ${err.toExponential(2)}）`); return o; };
const oh = simp(hi, HEAD), ob = simp(bi, BODY);
const all = new Uint32Array(oh.length + ob.length); all.set(oh); all.set(ob, oh.length);
// 压缩顶点
const map = new Int32Array(nV).fill(-1); let m = 0; for (const v of all) if (map[v] < 0) map[v] = m++;
const nP = new Float32Array(m * 3), nN = new Float32Array(m * 3), nU = new Float32Array(m * 2);
for (let v = 0; v < nV; v++) { const k = map[v]; if (k < 0) continue; nP.set(P.subarray(v * 3, v * 3 + 3), k * 3); nN.set(N.subarray(v * 3, v * 3 + 3), k * 3); nU.set(UV.subarray(v * 2, v * 2 + 2), k * 2); }
const nI = new Uint32Array(all.length); for (let i = 0; i < all.length; i++) nI[i] = map[all[i]];
const buf = raw.getRoot().listBuffers()[0];
rp.setAttribute('POSITION', raw.createAccessor().setType('VEC3').setArray(nP).setBuffer(buf));
rp.setAttribute('NORMAL', raw.createAccessor().setType('VEC3').setArray(nN).setBuffer(buf));
rp.setAttribute('TEXCOORD_0', raw.createAccessor().setType('VEC2').setArray(nU).setBuffer(buf));
rp.setIndices(raw.createAccessor().setType('SCALAR').setArray(nI).setBuffer(buf));
await raw.transform(prune());
await io.write(outPath, raw);
console.log(`✓ ${outPath}  ${nI.length / 3} 面  ${m} 顶点（头部 ${oh.length / 3} + 身体 ${ob.length / 3}）`);
