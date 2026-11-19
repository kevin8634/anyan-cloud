// raidA 11-01：首领头部独立贴图（零积分）。显示件里正面可见的脸部三角形拆成第二个 primitive / 材质 MI_GordonFace：
// TEXCOORD_0 = 正面平面投影（对应 1024 脸部贴图，本地 CodeFormer 修复 + Real-ESRGAN 超分 + 眼部修整，见 tools/rigfine/facehd/），
// TEXCOORD_1 = 原 UV（继续采样原法线 / 金属粗糙度贴图，TANGENT 原样拷贝，与烘焙法线一致）。主 primitive 删去这些三角形，不增面。
// 脸部贴图在选区边缘羽化回原贴图投影色，接缝两侧颜色一致。
// 用法：node tools/rigfine/gordon_facetex.mjs 显示件.glb 脸部贴图.png tris.bin x0,x1,y0,y1 输出.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync } from 'fs';
const [src, texF, trisF, rect, out] = process.argv.slice(2);
const [x0, x1, y0, y1] = rect.split(',').map(Number);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(src), root = doc.getRoot(); await doc.transform(dequantize());
const node = root.listNodes().find(n => n.getMesh()), mesh = node.getMesh(), p = mesh.listPrimitives()[0];
const tb = readFileSync(trisF), tris = new Uint32Array(tb.buffer, tb.byteOffset, tb.length / 4), isSel = new Uint8Array(p.getIndices().getCount() / 3);
for (const t of tris) isSel[t] = 1;
const I = p.getIndices().getArray(), buf = root.listBuffers()[0];
// 可选 SMOOTH=y下限：该高度以上（头部）按位置焊接、面积加权重算顶点法线（原件法线是分面的，近景看得到三角形块）；
// 主件与脸部件共用同一份结果，接缝两侧光照一致；TANGENT 对新法线做正交化（保留手性 w）。
if (process.env.SMOOTH) {
  const ymin = +process.env.SMOOTH, P = p.getAttribute('POSITION').getArray(), N = p.getAttribute('NORMAL').getArray(), Tg = p.getAttribute('TANGENT')?.getArray();
  const nV = P.length / 3, key = new Int32Array(nV), mapK = new Map();
  for (let v = 0; v < nV; v++) { const k = `${Math.round(P[v*3]*2e4)},${Math.round(P[v*3+1]*2e4)},${Math.round(P[v*3+2]*2e4)}`; let id = mapK.get(k); if (id === undefined) mapK.set(k, id = mapK.size); key[v] = id; }
  const acc = new Float64Array(mapK.size * 3);
  for (let t = 0; t < I.length / 3; t++) { const a = I[t*3], b = I[t*3+1], c = I[t*3+2];
    const ux = P[b*3]-P[a*3], uy = P[b*3+1]-P[a*3+1], uz = P[b*3+2]-P[a*3+2], wx = P[c*3]-P[a*3], wy = P[c*3+1]-P[a*3+1], wz = P[c*3+2]-P[a*3+2];
    const nx = uy*wz-uz*wy, ny = uz*wx-ux*wz, nz = ux*wy-uy*wx; for (const v of [a, b, c]) { acc[key[v]*3] += nx; acc[key[v]*3+1] += ny; acc[key[v]*3+2] += nz; } }
  let n = 0; for (let v = 0; v < nV; v++) { if (P[v*3+1] < ymin) continue; const k = key[v]; let x = acc[k*3], y = acc[k*3+1], z = acc[k*3+2]; const l = Math.hypot(x, y, z); if (!l) continue; x /= l; y /= l; z /= l;
    const bl = Math.min(1, (P[v*3+1] - ymin) / 0.01);   // 1 cm 过渡带，与下方原法线无缝
    let ax = N[v*3]*(1-bl)+x*bl, ay = N[v*3+1]*(1-bl)+y*bl, az = N[v*3+2]*(1-bl)+z*bl; const l2 = Math.hypot(ax, ay, az); N[v*3] = ax/l2; N[v*3+1] = ay/l2; N[v*3+2] = az/l2;
    if (Tg) { const d = Tg[v*4]*N[v*3]+Tg[v*4+1]*N[v*3+1]+Tg[v*4+2]*N[v*3+2]; let tx = Tg[v*4]-d*N[v*3], ty = Tg[v*4+1]-d*N[v*3+1], tz = Tg[v*4+2]-d*N[v*3+2]; const lt = Math.hypot(tx, ty, tz) || 1; Tg[v*4] = tx/lt; Tg[v*4+1] = ty/lt; Tg[v*4+2] = tz/lt; }
    n++; }
  console.log('头部法线平滑顶点', n);
}
// 主件：去掉选中三角
const keep = []; for (let t = 0; t < isSel.length; t++) if (!isSel[t]) keep.push(I[t*3], I[t*3+1], I[t*3+2]);
// 脸部件：顶点重排（共享顶点保持共享）
const remap = new Map(), faceI = [], order = [];
for (const t of tris) for (let j = 0; j < 3; j++) { const v = I[t*3+j]; if (!remap.has(v)) { remap.set(v, order.length); order.push(v); } faceI.push(remap.get(v)); }
const q = doc.createPrimitive();
for (const n of ['POSITION', 'NORMAL', 'TANGENT']) { const a = p.getAttribute(n); if (!a) continue; const k = a.getElementSize(), raw = a.getArray(), arr = new Float32Array(order.length * k); order.forEach((v, i) => { for (let c = 0; c < k; c++) arr[i*k+c] = raw[v*k+c]; }); q.setAttribute(n, doc.createAccessor().setType(a.getType()).setArray(arr).setBuffer(buf)); }
const P = p.getAttribute('POSITION').getArray(), UV = p.getAttribute('TEXCOORD_0').getArray();
const uv0 = new Float32Array(order.length * 2), uv1 = new Float32Array(order.length * 2);
order.forEach((v, i) => { uv0[i*2] = (P[v*3] - x0) / (x1 - x0); uv0[i*2+1] = (y1 - P[v*3+1]) / (y1 - y0); uv1[i*2] = UV[v*2]; uv1[i*2+1] = UV[v*2+1]; });
q.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv0).setBuffer(buf));
q.setAttribute('TEXCOORD_1', doc.createAccessor().setType('VEC2').setArray(uv1).setBuffer(buf));
q.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(faceI)).setBuffer(buf));
p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(buf));
const m0 = p.getMaterial(), m = m0.clone().setName('MI_GordonFace');
const ft = doc.createTexture('gordon_face').setImage(readFileSync(texF)).setMimeType('image/png');
m.setBaseColorTexture(ft); m.getBaseColorTextureInfo().setTexCoord(0);
if (m.getNormalTexture()) { if (process.env.NONRM) m.setNormalTexture(null); else { m.getNormalTextureInfo().setTexCoord(1); if (process.env.NSCALE) m.getNormalTextureInfo().setScale(+process.env.NSCALE); } }
if (m.getMetallicRoughnessTexture()) m.getMetallicRoughnessTextureInfo().setTexCoord(1);
if (m.getOcclusionTexture()) m.getOcclusionTextureInfo().setTexCoord(1);
if (m.getEmissiveTexture()) m.getEmissiveTextureInfo().setTexCoord(1);
q.setMaterial(m); mesh.addPrimitive(q);
await doc.transform(prune());
await io.write(out, doc);
console.log('脸部三角', tris.length, '主件', keep.length / 3, '→', out);
