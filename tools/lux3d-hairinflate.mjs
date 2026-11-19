// v1.2.54 发型蓬松：把发际线以上的顶点沿法线外推（底模与贴花层同步），让头发有体积感，不改骨骼权重。
// 用法：INFLATE=<发际线y>,<外推量>,<过渡高度> node tools/lux3d-hairinflate.mjs <in.glb> <out.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { statSync } from 'fs';
const [src, out] = process.argv.slice(2);
const [yh, amt, ramp] = (process.env.INFLATE || '0.89,0.01,0.03').split(',').map(Number);
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src), mesh = doc.getRoot().listMeshes()[0], prims = mesh.listPrimitives();
const base = prims[0], P = base.getAttribute('POSITION'), N = base.getAttribute('NORMAL');
const key = v => v.map(x => Math.round(x * 1e5)).join(',');
// 同一位置的顶点（UV 接缝处有多份）法线取平均，避免接缝裂开
const acc = new Map(), v = [0, 0, 0], n = [0, 0, 0];
for (let i = 0; i < P.getCount(); i++) { P.getElement(i, v); if (v[1] < yh - 0.001) continue; N.getElement(i, n); const k = key(v); const a = acc.get(k) || [0, 0, 0]; a[0] += n[0]; a[1] += n[1]; a[2] += n[2]; acc.set(k, a); }
const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
let moved = 0;
for (const q of prims) {
  const A = q.getAttribute('POSITION');
  for (let i = 0; i < A.getCount(); i++) {
    A.getElement(i, v); const a = acc.get(key(v)); if (!a) continue;
    const l = Math.hypot(...a) || 1, up = Math.max(0, a[1] / l), w = sm((v[1] - yh) / ramp) * amt * (0.45 + 0.55 * up);   // 头顶外推多、两侧少，避免鬓角外翻
    if (w <= 0) continue;
    A.setElement(i, [v[0] + a[0] / l * w, v[1] + a[1] / l * w, v[2] + a[2] / l * w]); moved++;
  }
}
await io.write(out, doc);
console.log('外推顶点', moved, '→', out, (statSync(out).size / 1024).toFixed(0), 'KB');
