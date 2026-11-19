// 11-13 负棺人不眠棺（Rhett「底下有细细长长的不知道啥」）：删掉某轴坐标低于阈值的三角面（棺尾细尖），0 积分纯几何
// 用法：node tools/trim-glb-below.mjs in.glb out.glb <轴 0/1/2> <阈值（该轴 min→max 的比例 0–1）>
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions'; import { prune, compactPrimitive } from '@gltf-transform/functions'; import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const [inp, out, axS, frS] = process.argv.slice(2); const ax = +axS, fr = +frS;
const d = await io.read(inp); let lo = Infinity, hi = -Infinity; const e = [];
for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); for (let i = 0; i < a.getCount(); i++) { a.getElement(i, e); lo = Math.min(lo, e[ax]); hi = Math.max(hi, e[ax]); } }
const cut = lo + (hi - lo) * fr; let kept = 0, drop = 0;
for (const m of d.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
  const a = p.getAttribute('POSITION'), ix = p.getIndices(); const src = ix.getArray(), o = [];
  for (let t = 0; t < src.length; t += 3) { let c = 0; for (let k = 0; k < 3; k++) { a.getElement(src[t + k], e); c += e[ax]; } if (c / 3 < cut) { drop++; continue; } o.push(src[t], src[t + 1], src[t + 2]); kept++; }
  ix.setArray(new (src.constructor)(o)); compactPrimitive(p);
}
await d.transform(prune());
await io.write(out, d); console.log(`cut=${cut.toFixed(3)} kept=${kept} drop=${drop}`);
