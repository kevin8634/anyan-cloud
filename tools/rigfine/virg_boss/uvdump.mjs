// raidA 11-02 维尔格 / 萨琳首领化（0 积分）：导出绑骨件显示网格的 UV 三角 + 每三角 3D 属性，给 skin.py 在 UV 空间按身体部位做选区
// node tools/rigfine/virg_boss/uvdump.mjs <rigged.glb> <outDir>   → outDir/uv.bin（Float32：每三角 3×uv(2) + 重心 xyz + 法线 xyz + 主骨号 = 13）+ pos.bin（每三角 3 顶点 xyz）+ uv.json（骨名表、包围盒）
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync, mkdirSync } from 'fs';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [inp, out] = process.argv.slice(2); mkdirSync(out, { recursive: true });
const doc = await io.read(inp); await doc.transform(dequantize());
const r = doc.getRoot(); const skin = r.listSkins()[0]; const names = skin.listJoints().map(n => n.getName().replace(/^mixamorig:?/, ''));
const p = r.listMeshes()[0].listPrimitives()[0];
const P = p.getAttribute('POSITION'), UV = p.getAttribute('TEXCOORD_0'), J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0'), I = p.getIndices();
const nT = I.getCount() / 3, o = new Float32Array(nT * 13), PO = new Float32Array(nT * 9); const a = [], b = [], c = [], u = [], jv = [], wv = [];
const dom = i => { J.getElement(i, jv); W.getElement(i, wv); let k = 0; for (let q = 1; q < 4; q++) if (wv[q] > wv[k]) k = q; return jv[k]; };
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let t = 0; t < nT; t++) {
  const ix = [I.getScalar(t * 3), I.getScalar(t * 3 + 1), I.getScalar(t * 3 + 2)];
  P.getElement(ix[0], a); P.getElement(ix[1], b); P.getElement(ix[2], c);
  for (let k = 0; k < 3; k++) { PO[t * 9 + k] = a[k]; PO[t * 9 + 3 + k] = b[k]; PO[t * 9 + 6 + k] = c[k]; }
  for (let k = 0; k < 3; k++) { UV.getElement(ix[k], u); o[t * 13 + k * 2] = u[0]; o[t * 13 + k * 2 + 1] = u[1]; }
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const L = Math.hypot(...n) || 1; n = n.map(x => x / L);
  for (let k = 0; k < 3; k++) { const m = (a[k] + b[k] + c[k]) / 3; o[t * 13 + 6 + k] = m; o[t * 13 + 9 + k] = n[k]; mn[k] = Math.min(mn[k], m); mx[k] = Math.max(mx[k], m); }
  // 主骨：三个顶点主骨的众数
  const d = ix.map(dom); o[t * 13 + 12] = d[0] === d[1] || d[0] === d[2] ? d[0] : d[1] === d[2] ? d[1] : d[0];
}
writeFileSync(out + '/uv.bin', Buffer.from(o.buffer)); writeFileSync(out + '/pos.bin', Buffer.from(PO.buffer)); writeFileSync(out + '/uv.json', JSON.stringify({ names, nT, min: mn, max: mx }));
console.log('三角', nT, '包围盒', mn.map(x => x.toFixed(3)), mx.map(x => x.toFixed(3)));
