// v1.2.54 角色脸部贴花（零积分）：Lux 原件脸只占 2048 贴图里约 140px，近景发糊。
// 做法：正面正交投影出脸部 → AI 放大重绘（对位不变）→ 作为半透明贴花层叠回模型：
// 复制正面可见的脸部三角形成第二个图元（同骨骼权重），UV = 正面平面投影，材质 MI_LuxFace（BLEND，边缘羽化）。
// 用法：node tools/lux3d-facedecal.mjs <LUX_X.glb> <decal.webp> <tris.bin(uint32 三角形序号)> <x0,x1,y0,y1> <输出.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFileSync, statSync } from 'fs';
const [src, decal, trisF, rect, out] = process.argv.slice(2);
const [x0, x1, y0, y1] = rect.split(',').map(Number);
const FLATN = Number(process.env.FLATN || 0);   // 0–1：贴花层法线向 +Z 压平的比例
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src), root = doc.getRoot();
const mesh = root.listMeshes()[0], p = mesh.listPrimitives()[0];
if (!process.env.STACK && mesh.listPrimitives().some(q => q.getMaterial()?.getName() === 'MI_LuxFace')) throw new Error('已有脸部贴花');
const tb = readFileSync(trisF), tris = new Uint32Array(tb.buffer, tb.byteOffset, tb.length / 4), I = p.getIndices().getArray();
const buf = root.listBuffers()[0];
const names = ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0'];
const q = doc.createPrimitive();
for (const n of names) {
  const a = p.getAttribute(n); if (!a) continue;
  // 直接拷原始（量化）数组：getElement 会反归一化成浮点，写回 Int16 会被截断
  const k = a.getElementSize(), raw = a.getArray(), arr = new raw.constructor(tris.length * 3 * k);
  let o = 0; for (const t of tris) for (let j = 0; j < 3; j++) { const vi = I[t * 3 + j]; arr.set(raw.subarray(vi * k, vi * k + k), o); o += k; }
  if (n === 'NORMAL' && FLATN > 0) {   // 法线朝正面压平：抹掉褶皱（如额头裂缝）的暗面，与贴花投影方向一致
    const f = a.getNormalized() ? (arr instanceof Int8Array ? 127 : arr instanceof Int16Array ? 32767 : 1) : 1;
    for (let i = 0; i < arr.length; i += k) { let x = arr[i] / f * (1 - FLATN), y = arr[i + 1] / f * (1 - FLATN), z = arr[i + 2] / f * (1 - FLATN) + FLATN; const l = Math.hypot(x, y, z) || 1; arr[i] = Math.round(x / l * f * 1e6) / 1e6; arr[i + 1] = Math.round(y / l * f * 1e6) / 1e6; arr[i + 2] = Math.round(z / l * f * 1e6) / 1e6; if (f > 1) { arr[i] = Math.round(x / l * f); arr[i + 1] = Math.round(y / l * f); arr[i + 2] = Math.round(z / l * f); } }
  }
  q.setAttribute(n, doc.createAccessor().setType(a.getType()).setArray(arr).setNormalized(a.getNormalized()).setBuffer(buf));
}
const P = p.getAttribute('POSITION'), v = [0, 0, 0], uv = new Float32Array(tris.length * 6);
let o = 0; for (const t of tris) for (let j = 0; j < 3; j++) { P.getElement(I[t * 3 + j], v); uv[o++] = (v[0] - x0) / (x1 - x0); uv[o++] = (y1 - v[1]) / (y1 - y0); }
q.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(uv).setBuffer(buf));
const tex = doc.createTexture('face_decal').setImage(readFileSync(decal)).setMimeType('image/webp');
const mat = doc.createMaterial('MI_LuxFace').setBaseColorTexture(tex).setAlphaMode('BLEND').setRoughnessFactor(0.7).setMetallicFactor(0);
q.setMaterial(mat); mesh.addPrimitive(q);
await io.write(out, doc);
console.log('贴花三角形', tris.length, '→', out, (statSync(out).size / 1024).toFixed(0), 'KB');
